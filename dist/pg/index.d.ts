/**
 * Postgres advisory locks as a hold store: `pgSession(db)` owns a pinned
 * transaction for the whole life of a lock; `pgTransaction(tx)` takes the lock
 * inside a transaction the caller already has, and the caller's COMMIT or
 * ROLLBACK ends it.
 *
 * Why a transaction, even for "session" locks: a pool hands each query to
 * whichever connection is free, so a session-level lock and its unlock could
 * land on different connections and the lock would leak. Here acquire, work
 * and release always happen inside ONE `db.transaction(cb)`, which pins one
 * connection. The lock is a transaction-level advisory lock, so ending the
 * transaction (commit, rollback, or a dead connection) is what frees it: there
 * is no unlock statement that can fail and leave the lock behind.
 *
 * While a lock is held, the pinned connection runs a short `pg_sleep` in a
 * loop. The beats start tiny and double up to `HOLD_BEAT_SECONDS`: release needs
 * the same connection, so it waits out the beat in flight, and a hold that has
 * only just begun therefore costs a few ms to end, not a whole long beat (a
 * long hold pays at most one long beat, a small share of its length). That does two jobs. A dropped connection fails the running query, so
 * the holder learns the lock is lost within a beat (`Grant.lost`). And a
 * connection that always has a query in flight reports its death to that
 * query, not as an unhandled `error` event on an idle client. A beat that does
 * not come back within `HOLD_BEAT_TIMEOUT_MS` (a silent network: no FIN, no
 * RST) also counts as lost: the server may already have freed the lock.
 *
 * Key spaces: by default a key is the two-int4 pair from `toPgPair`.
 * `legacyKeys: true` uses `hashtext('<namespace>:<name>')` as one bigint key,
 * which is what `@arki/db`'s `withAdvisoryLock` locks today. The two spaces do
 * NOT exclude each other: during a rolling deploy, every replica must use the
 * same setting.
 *
 * Read/write locks (`shared: true`): a read hold is `pg_advisory_xact_lock_shared`, a write
 * hold the exclusive lock, on the same pair space (read/write keys differ from mutex keys
 * by their `1rw:` prefix). Same pinned transaction, beat, wait slices and `lost` as the
 * mutex. `legacyKeys` applies to mutexes only. Postgres has no writer preference, so
 * `SharedOps.waiter` is not implemented and a steady stream of readers can starve a writer.
 *
 * PGlite note: advisory locks there are process-local (one connection), so it
 * can only check the SQL shape of this store, never cross-replica exclusion.
 */
import type { SQL } from 'drizzle-orm';
import type { SharedOps, Store } from '../types.js';
/** The least a transaction handle must offer: run raw SQL (node-postgres, PGlite, postgres.js through Drizzle). */
export type PgExecutor = {
    execute(query: SQL): PromiseLike<unknown>;
};
/** The least a database must offer: a transaction whose handle runs raw SQL. */
export type LockableDb = {
    transaction<T>(run: (tx: PgExecutor) => Promise<T>): Promise<T>;
};
export type PgLockOptions = {
    /**
     * Lock `hashtext('<namespace>:<name>')` (one bigint key) like `@arki/db`'s old
     * `withAdvisoryLock` did. Replicas on the legacy and the default key space do
     * not exclude each other, so a rolling deploy must switch every replica together.
     */
    readonly legacyKeys?: boolean;
};
export type PgSessionOptions = PgLockOptions & {
    /**
     * Beat on the pinned connection while held, so a dead or silent connection
     * resolves `Grant.lost`. Default `true`. Turn it off for in-process databases
     * such as PGlite, where there is no connection to lose and each beat would
     * block the thread; grants then carry no `lost`.
     */
    readonly keepAlive?: boolean;
};
/** What `pgSession` promises. */
export declare const pgSessionGuarantees: {
    readonly kind: 'hold';
    readonly scope: 'cluster';
    readonly wait: 'native';
    readonly shared: true;
    readonly permits: false;
    readonly fence: false;
    readonly releasedOnCrash: 'immediate';
    readonly clock: 'none';
    readonly poolerSafe: true;
    readonly runtimes: readonly ["node", "bun", "deno"];
};
export type PgSessionGuarantees = typeof pgSessionGuarantees;
/** What `pgTransaction` promises: `pgSession`'s guarantees, and the lock ends with the caller's transaction. */
export declare const pgTransactionGuarantees: {
    readonly kind: 'hold';
    readonly scope: 'cluster';
    readonly wait: 'native';
    readonly shared: true;
    readonly permits: false;
    readonly fence: false;
    readonly releasedOnCrash: 'immediate';
    readonly clock: 'none';
    readonly poolerSafe: true;
    readonly runtimes: readonly ["node", "bun", "deno"];
    readonly releasedBy: 'transaction';
};
export type PgTransactionGuarantees = typeof pgTransactionGuarantees;
/** Longest single `lock_timeout` slice of a wait; a caller's signal is honoured between slices. */
export declare const WAIT_SLICE_MS = 1000;
/** Longest beat of the pinned connection while a lock is held. */
export declare const HOLD_BEAT_SECONDS = 0.2;
/** The first beat of a hold; each next one doubles until `HOLD_BEAT_SECONDS`. */
export declare const HOLD_FIRST_BEAT_SECONDS = 0.001;
/** A beat still unanswered after this long means a silent connection; the hold is reported lost. */
export declare const HOLD_BEAT_TIMEOUT_MS = 5000;
/**
 * Advisory locks inside a transaction you already have. The lock lives until
 * that transaction ends; `release` only forgets the grant. Given a savepoint
 * handle (a nested `tx.transaction`), a ROLLBACK of that savepoint frees the
 * lock at once, while the outer transaction goes on. Postgres advisory
 * locks are re-entrant within one session, so a second acquire of the same key
 * on the same transaction succeeds: exclusion is between transactions. That holds for
 * read/write too: a read followed by a write of the same key in ONE transaction is
 * granted (Postgres lets one session take both), so there is no upgrade check here.
 */
export declare function pgTransaction(tx: PgExecutor, options?: PgLockOptions): Store<PgTransactionGuarantees> & {
    readonly shared: SharedOps;
};
/**
 * Advisory locks that own their connection: each acquire opens a transaction
 * on `db`, takes the lock, and keeps the transaction open until release. One
 * pool slot is used per held lock, so the pool needs a second connection for
 * the job itself.
 */
export declare function pgSession(db: LockableDb, options?: PgSessionOptions): Store<PgSessionGuarantees> & {
    readonly shared: SharedOps;
};
//# sourceMappingURL=index.d.ts.map