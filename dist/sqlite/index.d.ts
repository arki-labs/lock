/**
 * `sqliteLease`: a lease in a SQLite table, with a durable fence.
 *
 * The same lease model as `pgLease`: one row per key in `arki_lock`, never
 * deleted, so `generation` (the fence) never restarts. An acquire is one
 * INSERT .. ON CONFLICT DO UPDATE .. RETURNING. Every time comes from SQLite's
 * own clock, in milliseconds. Waiters poll: there is no wake-up path.
 *
 * SQLite has one writer per file. When another process holds the write lock, a
 * statement fails with SQLITE_BUSY and nothing ran. An acquire reads that as
 * "held right now", so the manager waits and tries again.
 */
import type { SQL } from 'drizzle-orm';
import type { Duration, PermitOps, Store } from '../types.js';
export { DEFAULT_LEASE_TABLE } from '../pg/lease.sql.js';
/** What `sqliteLease(db, { ttl })` promises. Every client of the database is kept apart; waiters poll. */
export declare const sqliteLeaseGuarantees: {
    readonly kind: 'lease';
    readonly scope: 'cluster';
    readonly wait: 'poll';
    readonly shared: false;
    readonly permits: true;
    readonly fence: 'durable';
    readonly releasedOnCrash: 'after-ttl';
    readonly clock: 'store';
    readonly poolerSafe: true;
    readonly runtimes: readonly ["node", "bun", "deno"];
};
export type SqliteLeaseGuarantees = typeof sqliteLeaseGuarantees;
/**
 * The least a database must offer: Drizzle's raw-SQL calls on an async SQLite driver, such as
 * the `db` from `createLibsqlDb` (`@arki/db/libsql`). Its write queue then gives these
 * statements their turn with the app's own writes. Pass the database, never a transaction
 * handle: a rollback would undo an acquire and hand the same fence out twice.
 */
export type SqliteLeaseDb = {
    run(query: SQL): PromiseLike<unknown>;
    all(query: SQL): PromiseLike<readonly unknown[]>;
};
export type SqliteLeaseOptions = {
    /** How long the lease lasts without renewal. At least 1 s. */
    readonly ttl: Duration;
    /** Default `arki_lock`. `name` or `schema.name` (an attached database). */
    readonly table?: string;
};
export type SqliteLeaseStore = Store<SqliteLeaseGuarantees> & {
    readonly permits: PermitOps;
};
/** The DDL for `table`, as text. Idempotent. Times are ms since the epoch; `holders` is a JSON array. */
export declare function leaseTableSql(table: string): string;
/** The DDL for the default table name, to copy into a migration. */
export declare const LEASE_TABLE_SQL: string;
/** Create the lease table if it is not there. Safe to call at every boot. */
export declare function ensureLockTable(db: SqliteLeaseDb, table?: string): Promise<import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
    method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
    outcome: "not-acquired" | "unknown";
    timeoutMs?: number | undefined;
}> | undefined>;
export declare function sqliteLease(db: SqliteLeaseDb, options: SqliteLeaseOptions): SqliteLeaseStore;
//# sourceMappingURL=index.d.ts.map