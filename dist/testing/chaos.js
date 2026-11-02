import { isFailure } from '@arki/failure';
import { check, defineCase, grab, leaseTtl, requestFor, skip, uniqueKey } from './contract.js';
/** Let the store's bound pass: a lease expires, an immediate store needs nothing. */
async function waitOutBound(store, options) {
    if (store.guarantees.releasedOnCrash === 'immediate')
        return;
    const ttl = leaseTtl(store, options);
    if (ttl === undefined || options.advanceTime === undefined)
        skip('needs `ttl` and `advanceTime` to wait out the lease');
    await options.advanceTime(ttl + 1);
}
export function chaos(makeStore, hooks, options = {}) {
    return [
        defineCase('chaos: killing the holder frees the key within the bound', makeStore, options, async ({ store }) => {
            const { killHolder } = hooks;
            if (killHolder === undefined)
                skip('hook killHolder not supplied');
            const key = uniqueKey('chaos-kill');
            const grant = await grab(store, key, options);
            await killHolder(store, grant);
            await waitOutBound(store, options);
            await grab(store, key, options);
        }),
        defineCase('chaos: failing renewals loses the lock and aborts the holder', makeStore, options, async ({ store, locks }) => {
            const { failRenewals } = hooks;
            if (failRenewals === undefined)
                skip('hook failRenewals not supplied');
            if (store.guarantees.kind !== 'lease')
                skip('hold store: nothing is renewed');
            const ttl = leaseTtl(store, options);
            if (ttl === undefined || options.advanceTime === undefined || options.scheduler === undefined) {
                skip('needs `ttl`, `advanceTime` and `scheduler` to drive renewals');
            }
            const guard = await locks.mutex(uniqueKey('chaos-renew').name).acquire({ wait: '1s' });
            check(!isFailure(guard), 'the lock should be free');
            await failRenewals(store, Number.MAX_SAFE_INTEGER);
            await options.advanceTime(ttl * 2);
            check(!guard.held && guard.signal.aborted, 'holder should know the lock is lost');
        }),
        defineCase('chaos: dropping the pinned connection frees the key', makeStore, options, async ({ store }) => {
            const { dropConnection } = hooks;
            if (dropConnection === undefined)
                skip('hook dropConnection not supplied');
            const key = uniqueKey('chaos-drop');
            await grab(store, key, options);
            await dropConnection(store);
            await waitOutBound(store, options);
            await grab(store, key, options);
        }),
        defineCase('chaos: a skewed client clock does not free a held key', makeStore, options, async ({ store }) => {
            const { skewClock } = hooks;
            if (skewClock === undefined)
                skip('hook skewClock not supplied');
            const key = uniqueKey('chaos-skew');
            await grab(store, key, options);
            await skewClock(store, Math.floor((leaseTtl(store, options) ?? 4000) / 4));
            check((await store.acquire(key, requestFor(store, options))) === undefined, 'key should still be held');
        }),
    ];
}
//# sourceMappingURL=chaos.js.map