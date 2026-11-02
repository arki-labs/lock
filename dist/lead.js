import { partition, UnexpectedDefect } from '@arki/failure';
import { getLogger } from '@arki/log';
import { lockFailure } from './errors.js';
import { LockError } from './errors.js';
const log = getLogger('arki:lock');
function ignore() {
    // A failing wake-up hook costs only the early wake-up.
}
/**
 * Sleep one beat, or until the store wakes us (only when `mayWake`: after a refused campaign,
 * never after our own term, because the key is free then and the hook would return at once), or until `signal` aborts. Leaves no timer behind. */
async function waitBeat(deps, signal, mayWake) {
    if (signal?.aborted === true)
        return;
    const wake = new AbortController();
    let timer;
    let onAbort;
    await new Promise(resolve => {
        // ref: true. Leader election is the app's main loop: a process whose only work is
        // campaigning must stay alive, so the beat timer is allowed to hold it open.
        // It is always cleared on abort, so it never blocks a shutdown.
        timer = deps.scheduler.setTimeout(resolve, deps.beatMs, { ref: true });
        if (signal !== undefined) {
            onAbort = resolve;
            signal.addEventListener('abort', onAbort, { once: true });
        }
        if (mayWake && deps.waitFor !== undefined) {
            // A failing hook, sync or async, only costs the early wake-up; the beat timer still fires.
            try {
                deps.waitFor(deps.key, wake.signal).then(resolve, ignore);
            }
            catch {
                ignore();
            }
        }
    });
    if (timer !== undefined)
        deps.scheduler.clearTimeout(timer);
    if (onAbort !== undefined)
        signal?.removeEventListener('abort', onAbort);
    wake.abort();
}
/**
 * Campaign until `opts.signal` aborts (forever without one). Resolves, never rejects.
 * `fn` should run for as long as it wants leadership: when it returns, the lease is
 * released and the loop campaigns again after a beat.
 */
export async function lead(deps, fn, opts = {}) {
    const { signal } = opts;
    const { keyField } = deps;
    const aborted = () => signal?.aborted === true;
    while (!aborted()) {
        let guard;
        try {
            guard = await deps.tryAcquire(signal === undefined ? {} : { signal });
        }
        catch (error) {
            // A store failure or an abort during the attempt: not leader this round.
            if (aborted())
                return;
            return lockFailure(error);
        }
        // After any term (even a stillborn one) the key is free, so the next wait must not use the store's wake-up hook.
        const gotLease = guard !== undefined;
        // The signal can abort while a grant lands (renew-now): hand it back without running fn.
        if (guard?.signal.aborted === true) {
            try {
                await guard.release();
            }
            catch (error) {
                deps.onReleaseError(error);
            }
        }
        else if (guard !== undefined) {
            deps.counts.leadAcquired += 1;
            log.debug('leading {key} (fence {fence})', { key: keyField, fence: guard.fence?.toString() ?? 'none' });
            let callbackFailure;
            try {
                const value = await fn({ signal: guard.signal, fence: guard.fence, key: guard.key });
                const [, failures] = partition([value]);
                callbackFailure = failures[0];
            }
            catch (error) {
                callbackFailure = UnexpectedDefect({ cause: error });
            }
            const reason = guard.signal.reason;
            if (reason instanceof LockError && reason.code === 'lost')
                deps.counts.leadLost += 1;
            try {
                await guard.release();
            }
            catch (error) {
                deps.onReleaseError(error);
            }
            log.debug('stepped down {key}', { key: keyField });
            if (callbackFailure !== undefined)
                return callbackFailure;
            if (reason instanceof LockError && reason.code === 'lost')
                return lockFailure(reason);
        }
        try {
            await waitBeat(deps, signal, !gotLease);
        }
        catch (error) {
            return lockFailure(error);
        }
    }
    return;
}
//# sourceMappingURL=lead.js.map