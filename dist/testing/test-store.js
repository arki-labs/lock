import { orThrow } from '@arki/failure';
import { LockError } from '../errors.js';
import { memoryStore } from '../memory.js';
import { defaultScheduler } from '../scheduler.js';
import { parseDuration } from '../wait.js';
const DEFAULT_TTL = '30s';
const notOwner = Promise.resolve('not-owner');
const gone = Promise.resolve(false);
const kept = Promise.resolve(true);
export function testStore(guarantees, options = {}) {
    const scheduler = options.scheduler ?? defaultScheduler;
    const leased = guarantees.kind === 'lease';
    const ttlMs = parseDuration(options.ttl ?? DEFAULT_TTL);
    const base = memoryStore();
    const leaseTables = [];
    /** Wrap one primitive of the memory store so its grants keep `guarantees`. */
    function keep(ops) {
        /** Live leases of this primitive, by token. */
        const leases = new Map();
        leaseTables.push(leases);
        const live = (grant) => {
            const lease = leases.get(grant.token);
            return lease?.grant.key.full === grant.key.full ? lease : undefined;
        };
        const expireLater = (token, ms) => scheduler.setTimeout(async () => {
            const lease = leases.get(token);
            if (lease === undefined)
                return;
            leases.delete(token);
            // Free the key first, as a real store does; the holder learns of it after.
            orThrow(await ops.release(lease.grant));
            lease.lose(new LockError({
                code: 'lost',
                message: 'the lease ran out on the test store clock',
                remediation: 'Renew the lease (the manager does every ttl/3) or move the clock less far.',
                detectedBy: 'deadline',
            }));
        }, ms);
        const acquire = async (key, req) => {
            const granted = await ops.acquire(key, req);
            if (granted === undefined)
                return granted;
            const fence = guarantees.fence === false || granted.fence === undefined ? {} : { fence: granted.fence };
            if (!leased)
                return { key: granted.key, token: granted.token, ...fence };
            const leaseMs = req.ttlMs ?? ttlMs;
            const settlers = {};
            const lost = new Promise(resolve => {
                settlers.resolve = resolve;
            });
            const lose = (error) => settlers.resolve?.(error);
            leases.set(granted.token, { grant: granted, timer: expireLater(granted.token, leaseMs), lose });
            return { key: granted.key, token: granted.token, ...fence, expiresAt: scheduler.now() + leaseMs, lost };
        };
        const release = (grant) => {
            if (!leased)
                return ops.release(grant);
            const lease = live(grant);
            // Expired, or never ours: the lease is gone.
            if (lease === undefined)
                return notOwner;
            scheduler.clearTimeout(lease.timer);
            leases.delete(grant.token);
            return ops.release(lease.grant);
        };
        const extend = (grant, leaseMs) => {
            const lease = live(grant);
            if (lease === undefined)
                return gone;
            scheduler.clearTimeout(lease.timer);
            lease.timer = expireLater(grant.token, leaseMs);
            return kept;
        };
        return leased ? { acquire, release, extend } : { acquire, release };
    }
    const mutex = keep(base);
    const permits = guarantees.permits
        ? { ...keep(base.permits), waiter: (key, weight) => base.permits.waiter(key, weight) }
        : undefined;
    const shared = guarantees.shared
        ? { ...keep(base.shared), waiter: (key, mode) => base.shared.waiter(key, mode) }
        : undefined;
    return {
        name: 'test',
        guarantees,
        ...(leased ? { ttlMs } : {}),
        ...mutex,
        waitFor: (key, signal) => base.waitFor(key, signal),
        waiter: (key) => base.waiter(key),
        ...(permits === undefined ? {} : { permits }),
        ...(shared === undefined ? {} : { shared }),
        dispose() {
            for (const leases of leaseTables) {
                for (const lease of leases.values())
                    scheduler.clearTimeout(lease.timer);
                leases.clear();
            }
            return Promise.resolve();
        },
    };
}
//# sourceMappingURL=test-store.js.map