import { isFailure, UnexpectedFailure } from '@arki/failure';
import { infra } from '@arki/dot/unit';
import { LockError } from '../errors.js';
import { createLocks } from '../locks.js';
/** True when `NODE_ENV` is `production`. Safe on runtimes with no `process`. */
function inProduction() {
    return typeof process !== 'undefined' && process.env['NODE_ENV'] === 'production';
}
/** A process-scope store in production means every replica runs the job. Refuse it unless asked. */
function assertStoreFitsEnvironment(store, allowProcessScope) {
    if (allowProcessScope === true || !inProduction() || store.guarantees.scope !== 'process')
        return;
    throw new LockError({
        code: 'config',
        message: `lock store "${store.name}" has process scope, but NODE_ENV is production`,
        remediation: 'a process-scope lock store excludes callers in this process only; every replica would run the job — use pgSession/pgLease/redisStore, or set allowProcessScope: true for a single-replica app',
    });
}
/**
 * Publish `locks`. The store is built, checked and wrapped at boot; a bad store fails the boot.
 *
 * @example
 * ```ts
 * defineApp('billing').infra(locks({ namespace: 'billing', needs: { db }, store: ({ db }) => pgLease(db) }));
 * ```
 */
export function locks(options) {
    const { namespace, store, allowProcessScope, storeTimeout, onReleaseError } = options;
    return infra({
        name: 'locks',
        ...(options.needs === undefined ? {} : { needs: options.needs }),
        provides: {
            locks: (deps) => {
                const built = store(deps);
                assertStoreFitsEnvironment(built, allowProcessScope);
                return createLocks({
                    store: built,
                    namespace,
                    ...(storeTimeout === undefined ? {} : { storeTimeout }),
                    ...(onReleaseError === undefined ? {} : { onReleaseError }),
                });
            },
        },
        async dispose({ locks: handle }) {
            // Dot disposal is a foreign void protocol; its supervisor receives canonical evidence.
            const outcome = await handle.store.dispose?.();
            if (isFailure(outcome))
                throw new UnexpectedFailure(outcome);
        },
    });
}
/** Name the store behind a lock service and what it promises. */
export function describeLocks(service) {
    const { name, guarantees } = service.store;
    return {
        store: name,
        kind: guarantees.kind,
        scope: guarantees.scope,
        fence: guarantees.fence,
        releasedOnCrash: guarantees.releasedOnCrash,
    };
}
//# sourceMappingURL=index.js.map