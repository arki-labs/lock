import type { CreateLocksOptions, Locks, Store } from './types.js';
/**
 * The shortest lease the manager accepts. Renewal runs every ttl/3, so a
 * shorter lease would renew faster than a store round trip can be trusted.
 */
export declare const MIN_LEASE_TTL_MS = 1000;
export declare function createLocks<S extends Store>(options: CreateLocksOptions<S>): Locks<S>;
//# sourceMappingURL=locks.d.ts.map