/**
 * The lease table. Apps may run `ensureLockTable(db)` at boot, or copy
 * `LEASE_TABLE_SQL` into their own migrations.
 *
 * One row per key. The row is never deleted: `generation` lives in it, and a
 * deleted row would restart the fence at 1. A semaphore key is one row too: its
 * live holders are the `holders` jsonb array, `[{ t: token, w: weight, f: fence, e: expiry ms }]`,
 * and `permits_limit` is the limit they were granted under. Holders sit in the key's own row
 * on purpose: an acquire is one INSERT .. ON CONFLICT DO UPDATE, and Postgres re-reads the
 * LOCKED row before it checks the capacity, so two acquirers can never both see free permits.
 * (Holders in a second table would be read from the statement's old snapshot.) A mutex row
 * leaves `permits_limit` NULL and `holders` empty. `expires_at` and `token` are unused on a
 * semaphore row (each holder carries its own expiry); `expires_at` is only set at insert.
 */
import type { SQL } from 'drizzle-orm';
export declare const DEFAULT_LEASE_TABLE = "arki_lock";
/** The table name as a quoted SQL identifier. Throws `LockError{code:'config'}` for anything else. */
export declare function tableIdentifier(table: string): SQL;
/** The DDL for the default table name. */
export declare const LEASE_TABLE_SQL: string;
/** The table name as quoted SQL text, for DDL. Throws `LockError{code:'config'}` like {@link tableIdentifier}. */
export declare function quotedTable(table: string): string;
/** The DDL for `table`, as text. Idempotent. */
export declare function leaseTableSql(table: string): string;
/**
 * PL/pgSQL statements (for a DO block) that add the `holders` column to a table made before
 * semaphores. The catalog is checked first: ALTER TABLE takes ACCESS EXCLUSIVE even when the
 * column exists, which would stall every lease behind any open reader at each boot.
 */
export declare function leaseUpgradeSql(table: string): string;
//# sourceMappingURL=lease.sql.d.ts.map