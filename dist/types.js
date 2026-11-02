/** Canonical spellings shared by types and their optional Zod schemas. */
export const DURATION_UNITS = ['ms', 's', 'm', 'h'];
export const GUARANTEE_VALUES = {
    kind: ['hold', 'lease'],
    scope: ['process', 'host', 'cluster'],
    wait: ['native', 'wake', 'poll', 'none'],
    fence: ['durable', 'best-effort', 'process'],
    releasedOnCrash: ['immediate', 'after-ttl'],
    clock: ['store', 'host', 'none'],
    runtime: ['node', 'bun', 'deno', 'browser', 'hermes'],
    releasedBy: ['transaction'],
};
export const MAX_NAME_BYTES = 512;
/** Postgres stores permit counts as signed integers. */
export const MAX_PERMITS = 2_147_483_647;
/** Preconditions on already typed permit counts; external input uses the source schema. */
export function isPermitCount(value) {
    return Number.isInteger(value) && value >= 1 && value <= MAX_PERMITS;
}
// ---------------------------------------------------------------------------
// The store port
// ---------------------------------------------------------------------------
export const RELEASE_OUTCOMES = ['released', 'not-owner', 'unknown'];
/** One attempt at a read or write hold. */
export const SHARED_MODES = ['read', 'write'];
/** Names of the counters `Locks.counters` exposes (for tests). */
export const LOCK_COUNTER_NAMES = ['releaseErrors', 'leadAcquired', 'leadLost'];
//# sourceMappingURL=types.js.map