/**
 * Chaos cases. The store's own test supplies the hooks that break things
 * (an adapter implements the ones it can); a hook that is missing, or does not
 * apply to the store, makes its case skip with the reason.
 */
import type { Grant, Store } from '../types.js';
import type { ContractCase, ContractOptions, MakeStore } from './contract.js';
export type ChaosHooks = {
    /** Make the holder vanish without releasing, as a crash would. */
    readonly killHolder?: (store: Store, grant: Grant) => Promise<void>;
    /** Make the next `count` renewals fail. */
    readonly failRenewals?: (store: Store, count: number) => Promise<void>;
    /** Cut the connection a held lock is pinned to. */
    readonly dropConnection?: (store: Store) => Promise<void>;
    /** Move the client's clock by `ms`; the store's clock must stay the judge. */
    readonly skewClock?: (store: Store, ms: number) => Promise<void>;
};
export declare function chaos(makeStore: MakeStore, hooks: ChaosHooks, options?: ContractOptions): ContractCase[];
//# sourceMappingURL=chaos.d.ts.map