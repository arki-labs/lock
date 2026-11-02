import { observeLock } from '../telemetry.js';
import { z } from 'zod';
import { getLogger } from '@arki/log';
import { lockFenceSchema } from '../identity-schemas.js';
import { LockError, storeFailure } from '../errors.js';
import { limitSchema, weightSchema } from '../schemas.js';
import { backoffDelay, parseDuration } from '../wait.js';
import { acquireScript, extendScript, permitAcquireScript, permitExtendScript, permitFitsScript, permitReleaseScript, releaseScript, sharedAcquireScript, sharedExtendScript, sharedFitsScript, sharedReleaseScript, } from './scripts.js';
const log = getLogger('arki:lock');
const REDIS_WAIT_MODES = ['wake', 'poll'];
/**
 * What `redisStore` promises, with `wait: 'wake'` (the default `wake: 'pubsub'`). The store's own
 * `guarantees.wait` reads `'poll'` once pub/sub has failed or was switched off. The type keeps both.
 */
export const redisGuarantees = {
    kind: 'lease',
    scope: 'cluster',
    wait: REDIS_WAIT_MODES[0],
    shared: true,
    permits: true,
    fence: 'best-effort',
    releasedOnCrash: 'after-ttl',
    clock: 'store',
    poolerSafe: true,
    runtimes: ['node', 'bun', 'deno'],
};
/**
 * The Redis keys of one lock. They share the hash tag, so they share a cluster slot.
 * `lock` is the mutex key, the semaphore's holder ZSET, or unused by a read/write lock
 * (which uses `readers` and `writer`). `meta` is the semaphore's limit and weights.
 */
export function redisKeys(key) {
    const tag = `{${key.full}}`;
    return {
        lock: tag,
        fence: `${tag}:fence`,
        channel: `${tag}:free`,
        meta: `${tag}:meta`,
        readers: `${tag}:r`,
        writer: `${tag}:w`,
        readerFences: `${tag}:rf`,
    };
}
const acquireReply = z.tuple([z.number(), z.number()]);
const flagReply = z.union([z.literal(0), z.literal(1)]);
/** Read again after an await: TypeScript still thinks the signal is the way it was before. */
function isAborted(signal) {
    return signal.aborted;
}
function noop() {
    // A failed cleanup has nobody to tell.
}
function isNoScript(error) {
    return error instanceof Error && error.message.startsWith('NOSCRIPT');
}
/** Sleep `ms`, or less when `signal` aborts. */
function pause(ms, signal) {
    return new Promise(resolve => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
}
/** The store checks too, so a caller that skips the manager cannot store a limit or weight that breaks the count. */
function validatePermit(key, limit, weight) {
    if (!limitSchema.safeParse(limit).success || !weightSchema.safeParse(weight).success || weight > limit) {
        throw new LockError({
            code: 'config',
            message: `semaphore ${key.name}: weight ${weight} and limit ${limit} must be positive whole numbers, weight at most limit`,
            remediation: 'Pass a whole limit of at least 1 and a whole weight from 1 up to the limit.',
        });
    }
}
export function redisStore(client, options) {
    const ttlMs = parseDuration(options.ttl);
    if (!Number.isInteger(ttlMs) || ttlMs < 1) {
        throw new LockError({
            code: 'config',
            message: `redis ttl must be a whole number of milliseconds, at least 1 (got ${ttlMs})`,
            remediation: "Pass a ttl such as '30s'.",
        });
    }
    let mode = options.wake === 'poll' ? 'poll' : 'wake';
    const guarantees = {
        ...redisGuarantees,
        // Read on every use: a failed subscribe downgrades the store, and the guarantee must say so.
        get wait() {
            return mode;
        },
    };
    /** EVALSHA first (small on the wire), EVAL when the server has not cached the script yet. */
    async function run(script, keys, args) {
        try {
            return await client.evalsha(script.sha, keys.length, ...keys, ...args);
        }
        catch (error) {
            if (!isNoScript(error))
                throw error;
            return client.eval(script.source, keys.length, ...keys, ...args);
        }
    }
    // ---- wake-ups -----------------------------------------------------------
    let subscriber;
    const channels = new Map();
    function subscriberConnection() {
        if (subscriber !== undefined)
            return subscriber;
        const sub = client.duplicate();
        sub.on('error', (error) => {
            log.debug('redis lock subscriber error: {message}', { message: error.message });
        });
        sub.on('message', (channel) => {
            const entry = channels.get(channel);
            if (entry === undefined)
                return;
            for (const wake of entry.waiters)
                wake();
        });
        subscriber = sub;
        return sub;
    }
    function join(channel, wake) {
        const existing = channels.get(channel);
        if (existing !== undefined) {
            existing.waiters.add(wake);
            return existing;
        }
        const created = { waiters: new Set([wake]), ready: subscriberConnection().subscribe(channel).then(noop) };
        channels.set(channel, created);
        return created;
    }
    function leave(channel, wake) {
        const entry = channels.get(channel);
        if (entry === undefined)
            return;
        entry.waiters.delete(wake);
        if (entry.waiters.size > 0)
            return;
        channels.delete(channel);
        subscriber?.unsubscribe(channel).then(noop, noop);
    }
    async function isFree(lock) {
        return (await client.exists(lock)) === 0;
    }
    /** Poll with the core's backoff until the mutex key is free or `signal` aborts. */
    async function pollUntilFree(lock, signal) {
        for (let attempt = 0; !signal.aborted; attempt++) {
            await pause(backoffDelay(attempt), signal);
            if (isAborted(signal) || (await isFree(lock)))
                return;
        }
    }
    async function waitFor(key, signal) {
        return observeLock('store.waitFor', async () => {
            try {
                if (signal.aborted)
                    return;
                const { lock, channel } = redisKeys(key);
                if (mode === 'poll')
                    return pollUntilFree(lock, signal);
                let wake = noop;
                const woken = new Promise(resolve => {
                    wake = resolve;
                });
                signal.addEventListener('abort', wake, { once: true });
                try {
                    // Join first, check after: a release between the failed attempt and the
                    // subscribe is caught by the check, one after it by the message.
                    // Raced with `woken`: a subscribe stuck in ioredis's offline queue must not outlive an abort.
                    await Promise.race([join(channel, wake).ready, woken]);
                    if (isAborted(signal) || (await isFree(lock)))
                        return;
                    await woken;
                }
                catch (error) {
                    if (isAborted(signal))
                        return;
                    log.debug('redis pub/sub wake-up failed ({message}); polling from now on', {
                        message: error instanceof Error ? error.message : String(error),
                    });
                    mode = 'poll';
                    await pollUntilFree(lock, signal);
                }
                finally {
                    signal.removeEventListener('abort', wake);
                    leave(channel, wake);
                }
                return;
            }
            catch (error) {
                return storeFailure(error, 'waitFor');
            }
        });
    }
    /**
     * One caller's wait on a semaphore or read/write key. It subscribes once, then every `waitFor`
     * first asks `fits()` (so a release that landed before the subscribe is not missed) and only then
     * sleeps until a wake message. A wake that arrives between two calls is remembered. In poll mode
     * the waiter owns a backoff that keeps growing across its calls, so a long wait settles to the
     * slow end of `backoffDelay` instead of hitting Redis every few milliseconds.
     */
    function waiterFor(key, fits) {
        const { channel } = redisKeys(key);
        let attempt = 0;
        let woke = false;
        let nudge = noop;
        const consumeWake = () => {
            const was = woke;
            woke = false;
            return was;
        };
        const wake = () => {
            woke = true;
            nudge();
        };
        let joined;
        let closed = false;
        async function pollOnce(signal) {
            if (await fits())
                return;
            await pause(backoffDelay(attempt++), signal);
        }
        return {
            async waitFor(signal) {
                return observeLock('store.waitFor', async () => {
                    try {
                        if (closed || isAborted(signal))
                            return;
                        if (mode === 'poll')
                            return pollOnce(signal);
                        const aborted = new Promise(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
                        try {
                            joined ??= join(channel, wake);
                            // Raced with the abort: a subscribe stuck in ioredis's offline queue must not outlive it.
                            await Promise.race([joined.ready, aborted]);
                            if (isAborted(signal))
                                return;
                            if (consumeWake())
                                return;
                            if (await fits())
                                return;
                            if (consumeWake())
                                return;
                            await new Promise(resolve => {
                                nudge = resolve;
                                signal.addEventListener('abort', () => resolve(), { once: true });
                            });
                            woke = false;
                        }
                        catch (error) {
                            if (isAborted(signal))
                                return;
                            log.debug('redis pub/sub wake-up failed ({message}); polling from now on', {
                                message: error instanceof Error ? error.message : String(error),
                            });
                            mode = 'poll';
                            await pollOnce(signal);
                        }
                        finally {
                            nudge = noop;
                        }
                        return;
                    }
                    catch (error) {
                        return storeFailure(error, 'waitFor');
                    }
                });
            },
            close() {
                if (closed)
                    return;
                closed = true;
                if (joined !== undefined)
                    leave(channel, wake);
            },
        };
    }
    // ---- the store port -----------------------------------------------------
    /** A closed client never sent anything, so nothing was acquired. Later errors stay plain failures (`unknown`). */
    function assertOpen() {
        if (client.status === 'end') {
            throw new LockError({
                code: 'store',
                message: 'the redis connection is closed',
                remediation: 'Create a new client; this one was disconnected on purpose or gave up reconnecting.',
                outcome: 'not-acquired',
                method: 'acquire',
            });
        }
    }
    const permits = {
        async acquire(key, req) {
            return observeLock('store.acquire', async () => {
                try {
                    assertOpen();
                    validatePermit(key, req.limit, req.weight);
                    const { lock, meta, fence } = redisKeys(key);
                    const lease = req.ttlMs ?? ttlMs;
                    const [fenceValue, nowMs] = acquireReply.parse(await run(permitAcquireScript, [lock, meta, fence], [req.token, lease, req.limit, req.weight]));
                    if (fenceValue === -1) {
                        throw new LockError({
                            code: 'config',
                            message: `semaphore ${key.name} is held with a different limit than ${req.limit}`,
                            remediation: 'Every caller of one semaphore must pass the same limit. A new limit is accepted once no permit is held.',
                        });
                    }
                    if (fenceValue === 0)
                        return;
                    return { key, token: req.token, fence: lockFenceSchema.parse(BigInt(fenceValue)), expiresAt: nowMs + lease };
                }
                catch (error) {
                    return storeFailure(error, 'acquire');
                }
            });
        },
        async release(grant) {
            return observeLock('store.release', async () => {
                try {
                    const { lock, meta, channel } = redisKeys(grant.key);
                    return flagReply.parse(await run(permitReleaseScript, [lock, meta], [grant.token, channel])) === 1
                        ? 'released'
                        : 'not-owner';
                }
                catch (error) {
                    return storeFailure(error, 'release');
                }
            });
        },
        async extend(grant, leaseMs) {
            return observeLock('store.extend', async () => {
                try {
                    const { lock, meta } = redisKeys(grant.key);
                    return flagReply.parse(await run(permitExtendScript, [lock, meta], [grant.token, leaseMs])) === 1;
                }
                catch (error) {
                    return storeFailure(error, 'extend');
                }
            });
        },
        waiter(key, weight) {
            const { lock, meta } = redisKeys(key);
            return waiterFor(key, async () => flagReply.parse(await run(permitFitsScript, [lock, meta], [weight])) === 1);
        },
    };
    const shared = {
        async acquire(key, req) {
            return observeLock('store.acquire', async () => {
                try {
                    assertOpen();
                    const { readers, writer, fence, readerFences } = redisKeys(key);
                    const lease = req.ttlMs ?? ttlMs;
                    const [fenceValue, nowMs] = acquireReply.parse(await run(sharedAcquireScript, [readers, writer, fence, readerFences], [req.token, lease, req.mode]));
                    if (fenceValue === 0)
                        return;
                    return { key, token: req.token, fence: lockFenceSchema.parse(BigInt(fenceValue)), expiresAt: nowMs + lease };
                }
                catch (error) {
                    return storeFailure(error, 'acquire');
                }
            });
        },
        async release(grant) {
            return observeLock('store.release', async () => {
                try {
                    const { readers, writer, channel, readerFences } = redisKeys(grant.key);
                    return flagReply.parse(await run(sharedReleaseScript, [readers, writer, readerFences], [grant.token, channel])) === 1
                        ? 'released'
                        : 'not-owner';
                }
                catch (error) {
                    return storeFailure(error, 'release');
                }
            });
        },
        async extend(grant, leaseMs) {
            return observeLock('store.extend', async () => {
                try {
                    const { readers, writer, readerFences } = redisKeys(grant.key);
                    return (flagReply.parse(await run(sharedExtendScript, [readers, writer, readerFences], [grant.token, leaseMs])) === 1);
                }
                catch (error) {
                    return storeFailure(error, 'extend');
                }
            });
        },
        // A waiter here only fixes missed wake-ups. It does not hold back new readers: no writer preference in v1.
        waiter(key, waitMode) {
            const { readers, writer } = redisKeys(key);
            return waiterFor(key, async () => flagReply.parse(await run(sharedFitsScript, [readers, writer], [waitMode])) === 1);
        },
    };
    return {
        name: 'redis',
        guarantees,
        ttlMs,
        async acquire(key, req) {
            return observeLock('store.acquire', async () => {
                try {
                    assertOpen();
                    const { lock, fence } = redisKeys(key);
                    const lease = req.ttlMs ?? ttlMs;
                    const [fenceValue, nowMs] = acquireReply.parse(await run(acquireScript, [lock, fence], [req.token, lease]));
                    if (fenceValue === 0)
                        return;
                    return { key, token: req.token, fence: lockFenceSchema.parse(BigInt(fenceValue)), expiresAt: nowMs + lease };
                }
                catch (error) {
                    return storeFailure(error, 'acquire');
                }
            });
        },
        async release(grant) {
            return observeLock('store.release', async () => {
                try {
                    const { lock, channel } = redisKeys(grant.key);
                    return flagReply.parse(await run(releaseScript, [lock], [grant.token, channel])) === 1 ? 'released' : 'not-owner';
                }
                catch (error) {
                    return storeFailure(error, 'release');
                }
            });
        },
        async extend(grant, leaseMs) {
            return observeLock('store.extend', async () => {
                try {
                    const { lock } = redisKeys(grant.key);
                    return flagReply.parse(await run(extendScript, [lock], [grant.token, leaseMs])) === 1;
                }
                catch (error) {
                    return storeFailure(error, 'extend');
                }
            });
        },
        permits,
        shared,
        waitFor,
        async dispose() {
            return observeLock('store.dispose', async () => {
                try {
                    const sub = subscriber;
                    subscriber = undefined;
                    channels.clear();
                    if (sub !== undefined) {
                        // The caller's own client stays open; only the connection we made goes.
                        sub.disconnect();
                        log.debug('redis lock subscriber closed');
                    }
                    return;
                }
                catch (error) {
                    return storeFailure(error, 'dispose');
                }
            });
        },
    };
}
//# sourceMappingURL=index.js.map