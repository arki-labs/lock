import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { LockError } from '../errors.js';
export const DEFAULT_LEASE_TABLE = 'arki_lock';
/** `name` or `schema.name`; plain identifiers only, so the name is safe to quote. */
const tableNameSchema = z.string().regex(/^[A-Z_]\w{0,62}(\.[A-Z_]\w{0,62})?$/i, 'must be "name" or "schema.name"');
/** The table name as a quoted SQL identifier. Throws `LockError{code:'config'}` for anything else. */
export function tableIdentifier(table) {
    const parsed = tableNameSchema.safeParse(table);
    if (!parsed.success) {
        throw new LockError({
            code: 'config',
            message: `lease table ${JSON.stringify(table)} ${parsed.error.issues.map(issue => issue.message).join(', ')}`,
            remediation: 'Pass a plain table name such as "arki_lock" or "app.locks".',
        });
    }
    return sql.join(parsed.data.split('.').map(part => sql.identifier(part)), sql.raw('.'));
}
/** The DDL for the default table name. */
export const LEASE_TABLE_SQL = leaseTableSql(DEFAULT_LEASE_TABLE);
/** The table name as quoted SQL text, for DDL. Throws `LockError{code:'config'}` like {@link tableIdentifier}. */
export function quotedTable(table) {
    const parsed = tableNameSchema.safeParse(table);
    if (!parsed.success) {
        throw new LockError({
            code: 'config',
            message: `lease table ${JSON.stringify(table)} ${parsed.error.issues.map(issue => issue.message).join(', ')}`,
            remediation: 'Pass a plain table name such as "arki_lock" or "app.locks".',
        });
    }
    return parsed.data
        .split('.')
        .map(part => `"${part}"`)
        .join('.');
}
/** The DDL for `table`, as text. Idempotent. */
export function leaseTableSql(table) {
    const quoted = quotedTable(table);
    return `CREATE TABLE IF NOT EXISTS ${quoted} (
  key           text        PRIMARY KEY,
  token         text,
  generation    bigint      NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  permits_limit integer,
  holders       jsonb       NOT NULL DEFAULT '[]'::jsonb
);`;
}
/**
 * PL/pgSQL statements (for a DO block) that add the `holders` column to a table made before
 * semaphores. The catalog is checked first: ALTER TABLE takes ACCESS EXCLUSIVE even when the
 * column exists, which would stall every lease behind any open reader at each boot.
 */
export function leaseUpgradeSql(table) {
    const quoted = quotedTable(table);
    return `IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = '${quoted}'::regclass AND attname = 'holders' AND NOT attisdropped) THEN
    ALTER TABLE ${quoted} ADD COLUMN holders jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;`;
}
//# sourceMappingURL=lease.sql.js.map