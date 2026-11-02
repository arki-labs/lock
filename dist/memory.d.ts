/**
 * In-process hold store: mutex, counting semaphore and read/write locks.
 * Portable: no `node:*`, no timers.
 *
 * Waiting callers queue per key and the lock is handed over, not fought for. A caller
 * registers a waiter (`waiter(...)`) after its first refusal and keeps its place until it
 * gets the lock or stops waiting. A release reserves the lock for the waiter at the head and
 * wakes only that one; its next attempt (`req.waiter`) turns the reservation into a hold.
 * Nobody else can take a reserved lock, so a newcomer cannot barge in between the wake-up
 * and the retry, and a release costs O(woken), not O(waiting). A waiter that stops waiting
 * while it holds a reservation passes it on.
 *
 * - Mutex: a release wakes exactly one waiter, the one that began to wait first, so
 *   contended work runs FIFO.
 * - Semaphore (`permits`): a key holds up to `limit` permits, each hold takes `weight`.
 *   A release reserves permits for the queued waiters that now fit, in queue order, and
 *   wakes just those. There is no head-of-line blocking: a heavy waiter that does not fit
 *   is passed by lighter ones behind it. The limit is remembered only while the key has a
 *   holder or a reservation; a different limit while held is a `config` error.
 * - Read/write (`shared`): readers overlap, a writer excludes readers and writers, and there
 *   is no upgrade or downgrade. Writer preference: while a writer waits, new readers are
 *   refused and queued readers stay queued. Once the readers are out, a release hands the key
 *   to the first waiting writer; with no writer waiting, it admits every queued reader.
 *   Trade-off: a caller that holds a read lock and reads the same key again (a nested read)
 *   deadlocks while a writer waits, because the writer waits for the first read and the
 *   second read waits for the writer. Do not nest reads on one key.
 *
 * `waitFor` is the plain wake-up for callers without a waiter: it resolves once the key is free.
 *
 * The three primitives live in separate tables; the key already carries the primitive
 * (see `key.ts`), so one name can be a mutex, a semaphore and a read/write lock at once.
 */
import type { LockToken, LockFence } from './identities.js';
import type { Key, PermitOps, SharedOps, Store, Waiter } from './types.js';
/** What `memoryStore` promises. */
export declare const memoryGuarantees: {
    readonly kind: 'hold';
    readonly scope: 'process';
    readonly wait: 'wake';
    readonly shared: true;
    readonly writerPreference: true;
    readonly permits: true;
    readonly fence: 'process';
    readonly releasedOnCrash: 'immediate';
    readonly clock: 'none';
    readonly poolerSafe: true;
    readonly runtimes: readonly ["node", "bun", "deno", "browser", "hermes"];
};
export type MemoryGuarantees = typeof memoryGuarantees;
/** What `peek` shows about a held key. A copy: changing it changes nothing. */
export type MemoryEntry = {
    /** Mutex: the holder. Semaphore and readers: the earliest holder. */
    readonly owner: LockToken;
    /** The newest fence handed out for this key. */
    readonly fence: LockFence;
    readonly expiresAt?: number;
    /** Read/write keys: what the holders hold. */
    readonly mode?: 'read' | 'write';
    /** Semaphore keys: permits in use. */
    readonly permits?: number;
    /** Semaphore and read keys: how many holds there are. */
    readonly holders?: number;
};
export type MemoryStore = Store<MemoryGuarantees, never> & {
    /** Resolves when the key is free (any primitive), or when `signal` aborts. */
    waitFor(key: Key, signal: AbortSignal): Promise<void>;
    /** A mutex waiter: queued now, handed the lock by a release. */
    waiter(key: Key): Waiter<never>;
    readonly permits: PermitOps<never> & {
        waiter(key: Key, weight: number): Waiter<never>;
    };
    readonly shared: SharedOps<never> & {
        waiter(key: Key, mode: 'read' | 'write'): Waiter<never>;
    };
    /** The current holder of `key`, if any. A lock reserved for a woken waiter has none yet. For tests and debugging. */
    peek(key: Key): MemoryEntry | undefined;
};
export declare function memoryStore(): MemoryStore;
//# sourceMappingURL=memory.d.ts.map