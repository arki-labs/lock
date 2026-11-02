/**
 * The manager: turns a {@link Store}'s one-attempt protocol into `tryRun`,
 * `run`, `acquire` and `tryAcquire`. Owns the wait loop, the renewal loop, the
 * per-process queue in front of remote stores and the `lost` plumbing.
 *
 * Mutex, semaphore and read/write handles share one code path. Each binds a
 * {@link Protocol}: the store's own acquire/release/extend for a mutex, its
 * `permits` ops with `{ limit, weight }` for a semaphore, its `shared` ops with
 * `{ mode }` for read/write. Tokens, late-grant give-back, renewal, deadlines and
 * the per-process attempt gate are the same for all three.
 *
 * Everything below `createLocks` works on the plain `Store`. The gated public
 * types (`Locks<S>`, `Guard<S>`) are conditional on the store's guarantees,
 * which TypeScript cannot satisfy for a generic `S`. So `createLocks` is an
 * overload: the public signature promises `Locks<S>`, the implementation
 * returns the wide `LocksImpl` and TypeScript checks the two are compatible.
 */
import { isFailure, UnexpectedDefect, UnexpectedFailure } from '@arki/failure';
import { getLogger } from '@arki/log';
import { lockFailure, releaseFailure, storeFailure, LockError, LockHeld, LockStoreFailure, LockReleaseFailed } from './errors.js';
import { lockToken } from './identities.js';
import { createKey } from './key.js';
import { lead } from './lead.js';
import { defaultScheduler, supervisedScheduler } from './scheduler.js';
import { observeLock, report } from './telemetry.js';
import { isPermitCount } from './types.js';
import { semaphoreConfigSchema, storeTimeoutSchema } from './schemas.js';
import { answerSoFar, BACKOFF_MAX_MS, backoffDelay, NOT_YET, parseDuration, raceSignal, storeAnswer, withStoreTimeout, } from './wait.js';
const log = getLogger('arki:lock');
/**
 * The shortest lease the manager accepts. Renewal runs every ttl/3, so a
 * shorter lease would renew faster than a store round trip can be trusted.
 */
export const MIN_LEASE_TTL_MS = 1000;
const DEFAULT_STORE_TIMEOUT = '10s';
// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function noop() {
    // A late result is handled elsewhere; this only keeps it from being reported as unhandled.
}
function toError(error) {
    return error instanceof Error ? error : new Error(String(error));
}
function asStoreError(error, method) {
    if (error instanceof UnexpectedFailure && UnexpectedDefect.is(error.failure))
        throw error;
    if (error instanceof LockError)
        return error;
    return new LockError({
        code: 'store',
        message: `store ${method} failed`,
        remediation: 'Check the store. Ownership of the lock is unknown.',
        cause: error,
        outcome: 'unknown',
        method,
    });
}
/** Private ownership flow uses exceptions; the public store protocol returns failures. */
async function storeValue(promise, method) {
    const value = await promise;
    if (LockStoreFailure.is(value))
        throw asStoreError(value, method);
    if (UnexpectedDefect.is(value))
        throw new UnexpectedFailure(value);
    return value;
}
function asReleaseError(error) {
    if (error instanceof LockError && error.code === 'release')
        return error;
    return new LockError({
        code: 'release',
        message: 'the lock could not be released',
        remediation: 'The lock frees itself when its lease or connection ends. Check the store.',
        cause: error,
        method: 'release',
    });
}
/** Lock-side errors ride on the callback's own error, as `using` does. */
function addSuppressed(error, extra) {
    if (!(error instanceof Error) || extra.length === 0)
        return;
    const existing = error instanceof LockError ? (error.suppressed ?? []) : [];
    report(() => Object.defineProperty(error, 'suppressed', {
        value: [...existing, ...extra],
        configurable: true,
        writable: true,
        enumerable: false,
    }));
}
function configError(message, remediation) {
    return new LockError({ code: 'config', message, remediation });
}
export function createLocks(options) {
    const { store, namespace, onReleaseError } = options;
    const scheduler = options.scheduler === undefined ? defaultScheduler : supervisedScheduler(options.scheduler);
    const storeTimeoutMs = parseDuration(options.storeTimeout ?? DEFAULT_STORE_TIMEOUT);
    if (!storeTimeoutSchema.safeParse(storeTimeoutMs).success) {
        throw new LockError({
            code: 'config',
            message: 'storeTimeout must be at least 1 ms',
            remediation: "Pass a duration such as '10s'.",
        });
    }
    const logKeys = options.logKeys === true;
    const leased = store.guarantees.kind === 'lease';
    // The lease length is the store's own setting; the manager never imposes one.
    const leaseMs = 'ttlMs' in store && typeof store.ttlMs === 'number' ? store.ttlMs : 0;
    if (leased && !(leaseMs >= MIN_LEASE_TTL_MS)) {
        throw new LockError({
            code: 'config',
            message: `lease ttl ${leaseMs} ms is below the renewal floor of ${MIN_LEASE_TTL_MS} ms`,
            remediation: `Configure the lease store with a ttl of at least ${MIN_LEASE_TTL_MS} ms.`,
        });
    }
    const permitOps = store.guarantees.permits ? store.permits : undefined;
    const sharedOps = store.guarantees.shared ? store.shared : undefined;
    if (store.guarantees.permits && permitOps === undefined) {
        throw configError('the store claims permits but has no permits ops', 'Give the store `permits` ops or set guarantees.permits to false.');
    }
    if (store.guarantees.shared && sharedOps === undefined) {
        throw configError('the store claims shared locks but has no shared ops', 'Give the store `shared` ops or set guarantees.shared to false.');
    }
    if (leased && permitOps !== undefined && permitOps.extend === undefined) {
        throw configError('a lease store needs permits.extend', "Add `extend` to the store's permits ops.");
    }
    if (leased && sharedOps !== undefined && sharedOps.extend === undefined) {
        throw configError('a lease store needs shared.extend', "Add `extend` to the store's shared ops.");
    }
    const counts = { releaseErrors: 0, leadAcquired: 0, leadLost: 0 };
    const keyField = (key) => (logKeys ? key.full : 'hidden');
    /** The busy answer. The key rides along only under `logKeys`, as in logs. */
    const heldFailure = (key, waitedMs) => LockHeld(logKeys ? { key: key.full, waitedMs } : { waitedMs });
    // One in-flight remote attempt per key per process.
    const gates = new Map();
    function gated(key, fn) {
        if (store.guarantees.scope === 'process')
            return fn();
        const previous = gates.get(key.full) ?? Promise.resolve();
        const result = previous.then(fn);
        const tail = result.then(noop, noop);
        gates.set(key.full, tail);
        void tail.then(() => {
            if (gates.get(key.full) === tail)
                gates.delete(key.full);
        });
        return result;
    }
    /** Give a grant back with its own token, through the protocol that issued it. Never throws. */
    async function giveBack(protocol, grant, why) {
        try {
            await storeAnswer(storeValue(protocol.release(grant), 'release'), storeTimeoutMs, 'release', scheduler);
        }
        catch (error) {
            log.error(toError(error), { why, key: keyField(grant.key) });
        }
    }
    /** One store attempt: fresh owner token, bounded, and a late grant is handed back. */
    async function attemptOnce(protocol, key, waitMs, signal, waiter) {
        if (signal?.aborted === true)
            await raceSignal(Promise.resolve(), signal);
        const token = lockToken.create();
        if (isFailure(token))
            throw new UnexpectedFailure(token);
        const request = { token };
        if (leased)
            request.ttlMs = leaseMs;
        if (waitMs !== undefined)
            request.waitMs = waitMs;
        if (signal !== undefined)
            request.signal = signal;
        if (waiter !== undefined)
            request.waiter = waiter;
        // Only a lease is timed from the send.
        const sentAt = leased ? scheduler.now() : 0;
        let raw;
        try {
            raw = storeValue(protocol.acquire(key, request), 'acquire');
        }
        catch (error) {
            // A store that throws instead of rejecting fails the same way.
            raw = Promise.reject(asStoreError(error, 'acquire'));
        }
        const bound = storeTimeoutMs + (store.guarantees.wait === 'native' && waitMs !== undefined ? waitMs : 0);
        let grant;
        if (store.guarantees.releasedBy === 'transaction') {
            // The store runs on the caller's own transaction. Giving up early would hand that
            // transaction back while the store still has a statement on it, so the caller's next
            // statement would land in the middle of the store's wait. Wait for the store instead.
            try {
                grant = await raw;
            }
            catch (error) {
                throw asStoreError(error, 'acquire');
            }
            if (signal?.aborted === true) {
                if (grant !== undefined)
                    await giveBack(protocol, grant, 'aborted');
                await raceSignal(Promise.resolve(), signal);
            }
        }
        else {
            try {
                // Inline for the common in-process answer; anything in flight gets the timer and abort race.
                const first = await answerSoFar(raw);
                grant = first === NOT_YET ? await storeAnswer(raw, bound, 'acquire', scheduler, signal) : first;
                if (signal?.aborted === true)
                    await raceSignal(Promise.resolve(), signal);
            }
            catch (error) {
                // Attached only once we have given up, so it also catches a grant that
                // already landed in the same instant: nobody else will release it.
                void raw.then(late => {
                    if (late !== undefined)
                        void giveBack(protocol, late, 'late grant');
                }, noop);
                throw asStoreError(error, 'acquire');
            }
        }
        if (grant === undefined)
            return;
        if (leased && scheduler.now() - sentAt >= leaseMs) {
            log.warn('grant for {key} arrived after its ttl; refused', { key: keyField(key) });
            await giveBack(protocol, grant, 'stale grant');
            return;
        }
        return { grant, sentAt };
    }
    /** Sleep between attempts: a wake-up from the store, or full-jitter backoff. Wakes early on abort. */
    async function pause(key, leftMs, attempt, signal, session) {
        const waitFor = session === undefined
            ? store.waitFor === undefined
                ? undefined
                : (s) => storeValue(store.waitFor?.(key, s) ?? Promise.resolve(), 'waitFor')
            : (s) => storeValue(session.waitFor(s), 'waitFor');
        const ms = waitFor === undefined ? Math.min(backoffDelay(attempt), leftMs) : Math.min(leftMs, BACKOFF_MAX_MS);
        // Tells the store's wait to stop listening once this pause is over. Dropped when the store itself ended the wait.
        let wakeup = waitFor === undefined ? undefined : new AbortController();
        let timer;
        let onAbort;
        // A failing waitFor, sync or async, must not end the wait early or leak the timer: the timer still bounds it.
        const failed = (error) => {
            log.error(toError(error), { note: 'waitFor failed; falling back to backoff', key: keyField(key) });
        };
        try {
            // One promise for the three ways out: the timer, the caller's abort and the store's wake-up.
            await new Promise(resolve => {
                const done = () => {
                    resolve();
                };
                const wake = () => {
                    wakeup = undefined;
                    resolve();
                };
                timer = scheduler.setTimeout(done, ms, { ref: true });
                if (signal !== undefined) {
                    if (signal.aborted) {
                        done();
                        return;
                    }
                    onAbort = done;
                    signal.addEventListener('abort', onAbort, { once: true });
                }
                if (waitFor === undefined || wakeup === undefined)
                    return;
                try {
                    waitFor(wakeup.signal).then(wake, failed);
                }
                catch (error) {
                    failed(error);
                }
            });
        }
        finally {
            if (timer !== undefined)
                scheduler.clearTimeout(timer);
            // A wait the store already ended needs no cancel (and an abort is costly: it builds a DOMException).
            wakeup?.abort();
            if (onAbort !== undefined)
                signal?.removeEventListener('abort', onAbort);
        }
    }
    // -------------------------------------------------------------------------
    // The guard: renewal loop, deadline, loss, release
    // -------------------------------------------------------------------------
    function makeHeld(protocol, key, first, opts, holdMs) {
        const { grant } = first;
        const callerSignal = opts.signal;
        // Without a caller signal only a loss can abort it, so it is made when first read: most callbacks never read it.
        let controller = callerSignal === undefined ? undefined : new AbortController();
        const acquiredAt = holdMs > 0 ? scheduler.now() : 0;
        let deadline = leased ? first.sentAt + leaseMs : Number.POSITIVE_INFINITY;
        const firstDeadline = deadline;
        let ended;
        let lostError;
        let beatTimer;
        let deadlineTimer;
        let releasing;
        // Removes the forwarder from the caller's signal. A long-lived signal (an app shutdown) must not collect one per hold.
        let detachCaller;
        const stopTimers = () => {
            detachCaller?.();
            detachCaller = undefined;
            const beat = beatTimer;
            const expiry = deadlineTimer;
            if (beat !== undefined)
                report(() => scheduler.clearTimeout(beat));
            if (expiry !== undefined)
                report(() => scheduler.clearTimeout(expiry));
            beatTimer = undefined;
            deadlineTimer = undefined;
        };
        const lose = (detectedBy, cause) => {
            if (ended !== undefined)
                return;
            ended = 'lost';
            stopTimers();
            lostError = new LockError({
                code: 'lost',
                message: detectedBy === 'renewal'
                    ? 'the store no longer recognises this lock'
                    : detectedBy === 'connection'
                        ? 'the connection holding this lock ended'
                        : 'the lease deadline passed without a confirmed renewal',
                remediation: 'Stop the work. The callback may have had side effects; nothing retries it.',
                detectedBy,
                ...(cause === undefined ? {} : { cause }),
            });
            log.error('lock {key} lost ({detectedBy})', { key: keyField(key), detectedBy });
            controller?.abort(lostError);
        };
        const signalOf = () => {
            if (controller === undefined) {
                controller = new AbortController();
                if (lostError !== undefined)
                    controller.abort(lostError);
            }
            return controller.signal;
        };
        const doRelease = async () => {
            const wait = holdMs > 0 ? Math.max(0, holdMs - (scheduler.now() - acquiredAt)) : 0;
            if (wait > 0) {
                await new Promise(resolve => {
                    scheduler.setTimeout(resolve, wait, { ref: true });
                });
            }
            if (ended === 'lost')
                return;
            ended = 'released';
            stopTimers();
            let outcome;
            try {
                const raw = storeValue(protocol.release(grant), 'release');
                const first = await answerSoFar(raw);
                outcome = first === NOT_YET ? await storeAnswer(raw, storeTimeoutMs, 'release', scheduler) : first;
            }
            catch (error) {
                throw asReleaseError(error);
            }
            if (outcome === 'unknown') {
                throw new LockError({
                    code: 'release',
                    message: 'the store could not confirm the release',
                    remediation: 'The lock frees itself when its lease or connection ends. Check the store.',
                    outcome: 'unknown',
                    method: 'release',
                });
            }
            log.debug('released {key} ({outcome})', { key: keyField(key), outcome });
        };
        const release = () => {
            releasing ??= (async () => {
                const outcome = await observeLock('release', async () => {
                    try {
                        await doRelease();
                        return;
                    }
                    catch (error) {
                        return releaseFailure(error);
                    }
                });
                if (LockReleaseFailed.is(outcome))
                    throw asReleaseError(outcome);
            })();
            return releasing;
        };
        // The lease machinery: a local deadline, and a renewal every ttl/3 when the store can extend. Hold stores skip it.
        let renew;
        let extend;
        if (leased) {
            const extendFn = protocol.extend === undefined
                ? undefined
                : (g, ttlMs) => protocol.extend?.(g, ttlMs) ?? Promise.resolve(false);
            let renewing;
            let renewalFailure;
            const armDeadline = () => {
                if (deadlineTimer !== undefined)
                    scheduler.clearTimeout(deadlineTimer);
                if (!Number.isFinite(deadline))
                    return;
                deadlineTimer = scheduler.setTimeout(() => {
                    lose('deadline');
                }, Math.max(0, deadline - scheduler.now()), { ref: false });
            };
            const armBeat = (delayMs) => {
                if (extendFn === undefined || ended !== undefined)
                    return;
                // One chain only: an on-demand extend() replaces the pending beat.
                if (beatTimer !== undefined)
                    scheduler.clearTimeout(beatTimer);
                beatTimer = scheduler.setTimeout(() => {
                    beatTimer = undefined;
                    if (ended !== undefined || renewing !== undefined)
                        return;
                    return renewOnce().catch(error => { lose('renewal', error); });
                }, delayMs, { ref: false });
            };
            /** One renewal. Errors are logged and retried next beat until the deadline. */
            const renewOnce = () => {
                const run = (async () => {
                    if (extendFn === undefined)
                        return;
                    const sentAt = scheduler.now();
                    renewalFailure = undefined;
                    let ok;
                    try {
                        ok = await withStoreTimeout(storeValue(extendFn(grant, leaseMs), 'extend'), storeTimeoutMs, 'extend', scheduler);
                    }
                    catch (error) {
                        renewalFailure = storeFailure(error, 'extend');
                        log.error(toError(error), { note: 'renewal failed; retrying until the deadline', key: keyField(key) });
                        armBeat(leaseMs / 3);
                        return;
                    }
                    if (ended !== undefined) {
                        // The lock was given up while the renewal was in flight: hand it back.
                        if (ok)
                            await giveBack(protocol, grant, 'late renewal');
                        return;
                    }
                    if (!ok) {
                        lose('renewal');
                        return;
                    }
                    deadline = sentAt + leaseMs;
                    armDeadline();
                    armBeat(leaseMs / 3);
                })();
                renewing = run;
                return run.finally(() => {
                    if (renewing === run)
                        renewing = undefined;
                });
            };
            renew = renewOnce;
            if (extendFn !== undefined) {
                extend = async () => {
                    if (ended === 'lost' && lostError !== undefined)
                        throw lostError;
                    if (renewing === undefined) {
                        await renewOnce();
                    }
                    else {
                        await renewing;
                    }
                    if (ended === 'lost' && lostError !== undefined)
                        throw lostError;
                    if (renewalFailure !== undefined)
                        throw asStoreError(renewalFailure, 'extend');
                };
            }
            armDeadline();
            armBeat(leaseMs / 3);
        }
        if (callerSignal !== undefined) {
            const forward = () => {
                controller?.abort(callerSignal.reason);
            };
            if (callerSignal.aborted)
                forward();
            else {
                callerSignal.addEventListener('abort', forward, { once: true });
                detachCaller = () => {
                    callerSignal.removeEventListener('abort', forward);
                };
            }
        }
        // The public view, built on demand: `run` never needs one.
        let view;
        const guard = () => {
            view ??= {
                key,
                get signal() {
                    return signalOf();
                },
                get held() {
                    return ended === undefined && (deadline === Number.POSITIVE_INFINITY || scheduler.now() < deadline);
                },
                fence: grant.fence,
                get expiresAt() {
                    return grant.expiresAt === undefined ? undefined : grant.expiresAt + (deadline - firstDeadline);
                },
                ...(extend === undefined ? {} : { extend: () => observeLock('extend', async () => {
                        try {
                            await extend();
                            return;
                        }
                        catch (error) {
                            return lockFailure(error);
                        }
                    }) }),
                release: async () => {
                    try {
                        await release();
                        return;
                    }
                    catch (error) {
                        return releaseFailure(error);
                    }
                },
                [Symbol.asyncDispose]: async () => {
                    // ECMAScript disposal is a foreign void protocol: surface the canonical outcome explicitly.
                    const result = await guard().release();
                    if (isFailure(result))
                        throw new UnexpectedFailure(result);
                },
            };
            return view;
        };
        report(() => grant.lost?.then(reason => { lose('connection', reason); }, error => { lose('connection', error); }));
        log.debug('acquired {key}', { key: keyField(key) });
        const renewNow = renew !== undefined && first.sentAt + leaseMs - scheduler.now() < leaseMs / 3 ? renew : undefined;
        return { key, fence: grant.fence, signal: signalOf, release, lostError: () => lostError, guard, renewNow };
    }
    // -------------------------------------------------------------------------
    // Verbs
    // -------------------------------------------------------------------------
    async function acquireHeld(protocol, key, opts, mode) {
        const startedAt = scheduler.now();
        const waitMs = mode === 'wait' && opts.wait !== undefined ? parseDuration(opts.wait) : undefined;
        // Parsed before the store is asked: a bad value must fail with nothing held, not leak a grant.
        const holdMs = opts.holdAtLeast === undefined ? 0 : parseDuration(opts.holdAtLeast);
        if (mode === 'wait' && store.guarantees.scope !== 'process' && waitMs === undefined && opts.signal === undefined) {
            throw new LockError({
                code: 'config',
                message: 'a wait on a non-process store needs wait or signal',
                remediation: "Pass { wait: '5s' } or { signal }.",
            });
        }
        const limit = waitMs === undefined ? Number.POSITIVE_INFINITY : scheduler.now() + waitMs;
        // A mode-aware wait (writer preference) lives from the first refusal until this loop ends,
        // so a woken writer is still counted while its next attempt is in flight.
        let session;
        try {
            for (let attempt = 0;; attempt++) {
                const nativeWait = mode === 'wait' && store.guarantees.wait === 'native' && Number.isFinite(limit)
                    ? Math.max(0, limit - scheduler.now())
                    : undefined;
                const got = await gated(key, () => attemptOnce(protocol, key, nativeWait, opts.signal, session));
                if (got !== undefined) {
                    let held;
                    try {
                        held = makeHeld(protocol, key, got, opts, holdMs);
                    }
                    catch (error) {
                        await giveBack(protocol, got.grant, 'hold setup failed');
                        throw error;
                    }
                    // A grant with less than ttl/3 left renews at once instead of waiting a beat.
                    if (held.renewNow !== undefined)
                        await held.renewNow();
                    // Lost before the callback starts (refused, or past the deadline): never acquired.
                    if (held.lostError() === undefined)
                        return held;
                }
                if (mode === 'try')
                    return heldFailure(key, 0);
                const left = Number.isFinite(limit) ? limit - scheduler.now() : limit;
                if (left <= 0)
                    return heldFailure(key, Math.round(scheduler.now() - startedAt));
                session ??= protocol.waiter?.(key);
                await pause(key, left, attempt, opts.signal, session);
            }
        }
        finally {
            session?.close();
        }
    }
    async function runHeld(held, fn, opts) {
        let settled;
        try {
            const ctx = {
                // Read through, so a callback that never looks at the signal never makes one.
                get signal() {
                    return held.signal();
                },
                fence: held.fence,
                key: held.key,
            };
            settled = { ok: true, value: await fn(ctx) };
        }
        catch (error) {
            settled = { ok: false, error };
        }
        let releaseError;
        try {
            await held.release();
        }
        catch (error) {
            releaseError = asReleaseError(error);
        }
        const lost = held.lostError();
        if (!settled.ok) {
            addSuppressed(settled.error, [lost, releaseError].filter(e => e !== undefined));
            return UnexpectedDefect({ cause: settled.error });
        }
        // A callback failure is its own public identity even when ownership or cleanup also failed.
        if (!isFailure(settled.value) && lost !== undefined && (opts.onLost ?? 'abort') === 'abort')
            return lockFailure(lost);
        if (releaseError !== undefined) {
            // Decision 4: the callback succeeded, so the value is returned. The failure is reported, not thrown.
            counts.releaseErrors += 1;
            log.error('release of {key} failed after a successful callback: {error}', {
                key: keyField(held.key),
                error: releaseError,
            });
            try {
                report(() => onReleaseError?.(releaseFailure(releaseError)));
            }
            catch (error) {
                log.error(toError(error), { note: 'onReleaseError threw' });
            }
        }
        return settled.value;
    }
    /** The four verbs over one key. `protocolFor` runs per call, so a semaphore can check `weight` first. */
    function handleOver(key, protocolFor) {
        return {
            async tryRun(fn, opts = {}) {
                return await observeLock('try_run', async () => {
                    try {
                        const held = await acquireHeld(protocolFor(opts), key, opts, 'try');
                        if (LockHeld.is(held))
                            return held;
                        return await runHeld(held, fn, opts);
                    }
                    catch (error) {
                        return lockFailure(error);
                    }
                });
            },
            async run(fn, opts = {}) {
                return await observeLock('run', async () => {
                    try {
                        const held = await acquireHeld(protocolFor(opts), key, opts, 'wait');
                        if (LockHeld.is(held))
                            return held;
                        return await runHeld(held, fn, opts);
                    }
                    catch (error) {
                        return lockFailure(error);
                    }
                });
            },
            async acquire(opts = {}) {
                return observeLock('acquire', async () => {
                    try {
                        const held = await acquireHeld(protocolFor(opts), key, opts, 'wait');
                        return LockHeld.is(held) ? held : held.guard();
                    }
                    catch (error) {
                        return lockFailure(error);
                    }
                });
            },
            async tryAcquire(opts = {}) {
                return observeLock('try_acquire', async () => {
                    try {
                        const held = await acquireHeld(protocolFor(opts), key, opts, 'try');
                        return LockHeld.is(held) ? held : held.guard();
                    }
                    catch (error) {
                        return lockFailure(error);
                    }
                });
            },
        };
    }
    const mutexProtocol = {
        acquire: (key, req) => store.acquire(key, req),
        release: grant => store.release(grant),
        waiter: key => store.waiter?.(key),
        ...(store.extend === undefined
            ? {}
            : { extend: (grant, ttlMs) => store.extend?.(grant, ttlMs) ?? Promise.resolve(false) }),
    };
    function mutex(name) {
        const key = createKey(namespace, name);
        const handle = handleOver(key, () => mutexProtocol);
        if (!leased)
            return handle;
        return {
            ...handle,
            lead: (fn, opts) => observeLock('lead', () => lead({
                key,
                keyField: keyField(key),
                scheduler,
                beatMs: leaseMs / 3,
                counts,
                tryAcquire: async (callOpts) => {
                    const guard = await handle.tryAcquire(callOpts);
                    if (LockHeld.is(guard))
                        return;
                    if (isFailure(guard))
                        throw new UnexpectedFailure(guard);
                    return { ...guard, release: async () => {
                            const result = await guard.release();
                            if (isFailure(result))
                                throw new UnexpectedFailure(result);
                        } };
                },
                ...(store.waitFor === undefined ? {} : { waitFor: (k, s) => storeValue(store.waitFor?.(k, s) ?? Promise.resolve(), 'waitFor') }),
                onReleaseError: error => {
                    const releaseError = asReleaseError(error);
                    counts.releaseErrors += 1;
                    log.error('release of {key} failed while leading: {error}', { key: keyField(key), error: releaseError });
                    try {
                        report(() => onReleaseError?.(releaseFailure(releaseError)));
                    }
                    catch (hookError) {
                        log.error(toError(hookError), { note: 'onReleaseError threw' });
                    }
                },
            }, fn, opts)),
        };
    }
    function semaphoreOver(ops) {
        return (name, config) => {
            // A plain check per handle; only a refusal pays for the schema, which words the message.
            const parsedConfig = isPermitCount(config.limit) ? undefined : semaphoreConfigSchema.safeParse(config);
            if (parsedConfig !== undefined) {
                throw configError(`semaphore limit ${parsedConfig.error?.issues.map(issue => issue.message).join(', ') ?? 'is invalid'}`, 'Pass { limit } as a positive integer.');
            }
            const { limit } = config;
            return handleOver(createKey(namespace, name, 'semaphore'), opts => {
                const weight = opts.weight ?? 1;
                if (!isPermitCount(weight) || weight > limit) {
                    throw configError(`weight must be a positive integer of at most the limit (${limit})`, 'Pass a smaller weight, or declare a larger limit.');
                }
                return {
                    acquire: (key, req) => ops.acquire(key, { ...req, limit, weight }),
                    release: grant => ops.release(grant),
                    waiter: k => ops.waiter?.(k, weight),
                    ...(ops.extend === undefined
                        ? {}
                        : { extend: (grant, ttlMs) => ops.extend?.(grant, ttlMs) ?? Promise.resolve(false) }),
                };
            });
        };
    }
    function readWriteOver(ops) {
        return name => {
            const key = createKey(namespace, name, 'readWrite');
            const side = (mode) => {
                const protocol = {
                    acquire: (k, req) => ops.acquire(k, { ...req, mode }),
                    release: grant => ops.release(grant),
                    waiter: k => ops.waiter?.(k, mode),
                    ...(ops.extend === undefined
                        ? {}
                        : { extend: (grant, ttlMs) => ops.extend?.(grant, ttlMs) ?? Promise.resolve(false) }),
                };
                return handleOver(key, () => protocol);
            };
            return { read: side('read'), write: side('write') };
        };
    }
    return {
        store,
        namespace,
        counters: counts,
        mutex,
        ...(permitOps === undefined ? {} : { semaphore: semaphoreOver(permitOps) }),
        ...(sharedOps === undefined ? {} : { readWrite: readWriteOver(sharedOps) }),
    };
}
//# sourceMappingURL=locks.js.map