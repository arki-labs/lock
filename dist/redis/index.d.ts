/**
 * `@arki/lock/redis`: a lease store on one Redis (ioredis).
 *
 * - Keys are hash-tagged `{<full>}` so the lock, its fence counter and its
 *   wake channel always sit in one cluster slot.
 * - Acquire is one Lua step: `SET NX PX` plus `INCR` of the fence counter.
 *   Release and extend compare the token on the server.
 * - Semaphores keep holders in a ZSET scored by server-time expiry, with the
 *   limit and each holder's weight in a hash. Read/write locks keep readers in
 *   a ZSET and the writer in one key with a TTL. All of it is one Lua step per op.
 *   Readers can starve a writer here (no writer preference in v1).
 * - Waiters sleep on pub/sub (`wait: 'wake'`). If subscribing fails, or you
 *   ask for `wake: 'poll'`, they poll with backoff instead (`wait: 'poll'`).
 * - The fence is best-effort: the counter is lost on a restart or failover
 *   that drops data, so a fence may repeat after that. Use a durable store
 *   when the protected resource must reject stale writers.
 */
import type { Redis } from 'ioredis';
import type { Duration, Key, PermitOps, SharedOps, Store } from '../types.js';
export type RedisStoreOptions = {
    /** Lease length. The manager renews at a third of it. */
    readonly ttl: Duration;
    /**
     * `'pubsub'` (default): waiters wake on release through a second connection.
     * `'poll'`: no second connection; waiters poll with backoff.
     */
    readonly wake?: 'pubsub' | 'poll';
};
declare const REDIS_WAIT_MODES: readonly ['wake', 'poll'];
/**
 * What `redisStore` promises, with `wait: 'wake'` (the default `wake: 'pubsub'`). The store's own
 * `guarantees.wait` reads `'poll'` once pub/sub has failed or was switched off. The type keeps both.
 */
export declare const redisGuarantees: {
    readonly kind: 'lease';
    readonly scope: 'cluster';
    readonly wait: "wake";
    readonly shared: true;
    readonly permits: true;
    readonly fence: 'best-effort';
    readonly releasedOnCrash: 'after-ttl';
    readonly clock: 'store';
    readonly poolerSafe: true;
    readonly runtimes: readonly ["node", "bun", "deno"];
};
/** Runtime wait support changes only between the canonical Redis modes. */
export type RedisGuarantees = Omit<typeof redisGuarantees, 'wait'> & {
    readonly wait: (typeof REDIS_WAIT_MODES)[number];
};
export type RedisStore = Store<RedisGuarantees> & {
    readonly permits: PermitOps;
    readonly shared: SharedOps;
    /** Resolves when the key looks free, or when `signal` aborts. */
    waitFor(key: Key, signal: AbortSignal): Promise<void | import('../errors.js').StoreFailure>;
};
/**
 * The Redis keys of one lock. They share the hash tag, so they share a cluster slot.
 * `lock` is the mutex key, the semaphore's holder ZSET, or unused by a read/write lock
 * (which uses `readers` and `writer`). `meta` is the semaphore's limit and weights.
 */
export declare function redisKeys(key: Key): {
    readonly lock: string;
    readonly fence: string;
    readonly channel: string;
    readonly meta: string;
    readonly readers: string;
    readonly writer: string;
    readonly readerFences: string;
};
export declare function redisStore(client: Redis, options: RedisStoreOptions): RedisStore;
export {};
//# sourceMappingURL=index.d.ts.map