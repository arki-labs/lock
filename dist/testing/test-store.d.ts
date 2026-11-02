/**
 * `testStore(guarantees)`: an in-memory store that makes the promises of another store, so a
 * test can hand a feature a real lock manager typed exactly like production (`LocksFor<G>`),
 * with no cast.
 *
 * It is `memoryStore` (FIFO hand-off, semaphores, writer-preferring read/write) behind a thin
 * layer that keeps what `guarantees` says:
 *
 * - Fences are handed out iff `fence !== false` (memory's strictly increasing bigint).
 * - `semaphore` and `readWrite` exist iff `permits` and `shared` are set.
 * - `kind: 'lease'`: every hold expires `ttl` after it was granted, on the scheduler's clock,
 *   unless extended. Expiry frees the key (the next waiter gets it) and resolves `grant.lost`.
 *   `extend` never revives an expired lease. The permits and shared ops have `extend` too.
 * - `wait: 'native'`: a native store may block inside one attempt; the manager does not need it
 *   to. This store answers at once and the manager waits on the store's waiter instead, which
 *   it already does after a refusal. `'poll'` and `'none'` get the same waiters: waking a caller
 *   early breaks no promise a polling store makes.
 * - `releasedBy: 'transaction'`: there is no transaction, so a release frees the key, as if
 *   each `run` were its own transaction. A guard from `acquire()` has no `release` in its type
 *   and keeps the key until the store is dropped.
 *
 * Scope, crash release, clock and runtimes are labels here: one process, nothing crashes.
 */
import type { Scheduler } from '../scheduler.js';
import type { Duration, Guarantees, Key, PermitOps, SharedOps, Store, Waiter } from '../types.js';
export type TestStoreOptions = {
    /** The clock and timers a lease expires on. Give the manager the same one. Default: the global timers. */
    readonly scheduler?: Scheduler;
    /** Lease guarantees only: how long a lease lasts without renewal. Default `'30s'`. */
    readonly ttl?: Duration;
};
/** What `testStore(guarantees)` returns: a `Store<G, never>`, with the permits and shared ops when `G` claims them. */
export type TestStore<G extends Guarantees> = Store<G, never> & {
    waitFor(key: Key, signal: AbortSignal): Promise<void>;
    waiter(key: Key): Waiter<never>;
    /** Stops the lease timers. */
    dispose(): Promise<void>;
} & (G['permits'] extends true ? {
    readonly permits: PermitOps<never>;
} : unknown) & (G['shared'] extends true ? {
    readonly shared: SharedOps<never>;
} : unknown);
/**
 * An in-memory store that keeps every promise `guarantees` makes. Pass the guarantees of the
 * production store (`pgSessionGuarantees`, `pgLeasePollGuarantees`, ...) and the manager built
 * on it has the production handle's type.
 *
 * @example
 * ```ts
 * const clock = manualScheduler();
 * const store = testStore(pgSessionGuarantees, { scheduler: clock });
 * const locks = createLocks({ store, namespace: 'app', scheduler: clock }); // fits LocksFor<PgSessionGuarantees>
 * ```
 */
export declare function testStore<G extends Guarantees>(guarantees: G, options?: TestStoreOptions): TestStore<G>;
//# sourceMappingURL=test-store.d.ts.map