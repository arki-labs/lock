/**
 * `pgLease`: a lease in a Postgres table, with a durable fence.
 *
 * Every time comes from the database clock, and always `clock_timestamp()`:
 * `now()` is the start of the caller's transaction, so inside a long
 * transaction a lease would never look expired. Release keeps the row
 * (`token = NULL`) so `generation` never restarts. A crashed holder frees the
 * key `ttl` after its last renewal.
 */
import type { SQL } from 'drizzle-orm';
import type { Duration, PermitOps, Store } from '../types.js';
export { DEFAULT_LEASE_TABLE, LEASE_TABLE_SQL, leaseTableSql, leaseUpgradeSql } from './lease.sql.js';
/** What `pgLease(db, { ttl })` promises: waiters poll. */
export declare const pgLeasePollGuarantees: {
    readonly kind: 'lease';
    readonly scope: 'cluster';
    readonly shared: false;
    readonly permits: true;
    readonly fence: 'durable';
    readonly releasedOnCrash: 'after-ttl';
    readonly clock: 'store';
    readonly poolerSafe: true;
    readonly runtimes: readonly ['node', 'bun', 'deno'];
    readonly wait: 'poll';
};
/** What `pgLease(db, { ttl, listen })` promises: waiters wake on release. */
export declare const pgLeaseWakeGuarantees: {
    readonly kind: 'lease';
    readonly scope: 'cluster';
    readonly shared: false;
    readonly permits: true;
    readonly fence: 'durable';
    readonly releasedOnCrash: 'after-ttl';
    readonly clock: 'store';
    readonly poolerSafe: true;
    readonly runtimes: readonly ['node', 'bun', 'deno'];
    readonly wait: 'wake';
};
export type PgLeasePollGuarantees = typeof pgLeasePollGuarantees;
export type PgLeaseWakeGuarantees = typeof pgLeaseWakeGuarantees;
/**
 * The least a database must offer: raw SQL (drizzle on node-postgres, postgres.js or PGlite).
 * Autocommit only, never a transaction handle: a rollback would undo an acquire
 * (and hand the same fence out again) or undo a release (and keep the key held to ttl).
 * The first acquire checks this and refuses a transaction with `LockError{code:'config'}`.
 */
export type LeaseDb = {
    execute(query: SQL): PromiseLike<unknown>;
};
/**
 * A dedicated connection for LISTEN, such as `pool.connect()` on node-postgres.
 * Never a pooled-per-statement connection: LISTEN lives on one session.
 */
export type ListenClient = {
    query(text: string): Promise<unknown>;
    on(event: string, listener: (...args: never[]) => void): unknown;
    /** `true` destroys the connection. */
    release(error?: Error | boolean): void;
};
export type PgLeaseOptions = {
    /** How long the lease lasts without renewal. At least 1 s. */
    readonly ttl: Duration;
    /** Default `arki_lock`. `name` or `schema.name`. */
    readonly table?: string;
};
export type PgLeaseListenOptions = PgLeaseOptions & {
    /**
     * Gives a dedicated connection. With it, waiters wake on release instead of polling.
     * A direct connection: through PgBouncer in transaction mode LISTEN hears nothing.
     */
    readonly listen: () => Promise<ListenClient>;
};
export type PgLeaseStore<G extends PgLeasePollGuarantees | PgLeaseWakeGuarantees> = Store<G> & {
    readonly permits: PermitOps;
};
/** Create the lease table if it is not there. Safe to call at every boot, from every replica at once. */
export declare function ensureLockTable(db: LeaseDb, table?: string): Promise<import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
    method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
    outcome: "not-acquired" | "unknown";
    timeoutMs?: number | undefined;
}> | undefined>;
export declare function pgLease(db: LeaseDb, options: PgLeaseOptions): PgLeaseStore<PgLeasePollGuarantees>;
export declare function pgLease(db: LeaseDb, options: PgLeaseListenOptions): PgLeaseStore<PgLeaseWakeGuarantees>;
//# sourceMappingURL=lease.d.ts.map