/**
 * Leader election on a lease store: `locks.mutex(key).lead(fn, { signal })`.
 *
 * States of one campaigner:
 *   CAMPAIGN  tryAcquire. Won: go to LEAD. Refused or failed: go to WAIT.
 *   LEAD      run `fn(ctx)` and wait for it to settle. A lost lease aborts `ctx.signal`,
 *             but a second `fn` never starts while the first still runs.
 *   STEP DOWN release the lease (a release error is logged and counted, never thrown), go to WAIT.
 *   WAIT      sleep one beat (ttl/3) or until the store's `waitFor` wakes us, then CAMPAIGN.
 * `opts.signal` aborting in any state ends the loop after the step down.
 */
import type { FailureIn } from '@arki/failure';
import type { Scheduler } from './scheduler.js';
import type { LockOperationFailure } from './errors.js';
import type { LockContext, Store } from './types.js';
import type { Key } from './types.js';
/** What `fn` receives. Same shape as `LockContext`, wide because the store type is erased here. */
export type LeadContext = LockContext<Store>;
/** The part of a guard the loop needs. */
type LeadGuard = LeadContext & {
    release(): Promise<void>;
};
/** What `locks.ts` hands the loop. */
export type LeadDeps = {
    readonly key: Key;
    /** Hidden unless `logKeys`. */
    readonly keyField: string;
    readonly scheduler: Scheduler;
    /** One beat: the store's lease length divided by three. */
    readonly beatMs: number;
    readonly counts: {
        leadAcquired: number;
        leadLost: number;
    };
    tryAcquire(opts: {
        readonly signal?: AbortSignal;
    }): Promise<LeadGuard | undefined>;
    /** The store's wake-up hook, when it has one. */
    waitFor?(key: Key, signal: AbortSignal): Promise<void>;
    /** Count, log and report a failed release. */
    onReleaseError(error: unknown): void;
};
/**
 * Campaign until `opts.signal` aborts (forever without one). Resolves, never rejects.
 * `fn` should run for as long as it wants leadership: when it returns, the lease is
 * released and the loop campaigns again after a beat.
 */
export declare function lead<T>(deps: LeadDeps, fn: (ctx: LeadContext) => T | Promise<T>, opts?: {
    readonly signal?: AbortSignal;
}): Promise<void | FailureIn<Awaited<T>> | LockOperationFailure>;
export {};
//# sourceMappingURL=lead.d.ts.map