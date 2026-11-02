/**
 * The store conformance suite. `storeContract` returns plain `{ name, run }`
 * cases that any runner (or none) can execute: it never imports a test
 * framework. A case that does not apply to the store under test throws
 * {@link ContractSkip} with the reason; the runner reports it as skipped.
 */
import type { Scheduler } from '../scheduler.js';
import type { Grant, Key, Locks, ReadWriteHandle, SemaphoreConfig, SemaphoreHandle, Store } from '../types.js';
import type { LockToken } from '../identities.js';
/** Thrown by a case that does not apply to this store. `message` is the reason. */
export declare class ContractSkip extends Error {
    readonly name = "ContractSkip";
}
export type ContractCase = {
    readonly name: string;
    run(): Promise<void>;
};
export type ContractOptions = {
    /** Moves the store's clock (and the scheduler it shares) forward. Needed for lease expiry cases. */
    readonly advanceTime?: (ms: number) => Promise<void>;
    /** The lease length to test with. Default: the store's own `ttlMs`. */
    readonly ttl?: number;
    /** Callers in the race cases. `true` (default) = 16, `false` = skip the race cases. */
    readonly concurrent?: boolean | {
        readonly callers: number;
    };
    /** The scheduler the store was built with, handed to `createLocks`. */
    readonly scheduler?: Scheduler;
};
/**
 * A store built for one case, with the hooks that belong to that store alone: its own clock, its
 * own scheduler. A store whose clock is per case (an isolated table, a fresh manual scheduler)
 * must return this form, so a case that timed out and keeps running never moves the next case's clock.
 * Any field left out falls back to the fixed {@link ContractOptions}.
 */
export type CaseStore = {
    readonly store: Store;
    readonly advanceTime?: ContractOptions['advanceTime'];
    readonly ttl?: number;
    readonly scheduler?: Scheduler;
};
/** Builds a fresh store per case. Returns the bare store (fixed options) or a {@link CaseStore} (per-case hooks). */
export type MakeStore = () => Store | CaseStore | Promise<Store | CaseStore>;
/** Split what `makeStore` returned into the store and the options for this case alone. */
export declare function resolveMade(made: Store | CaseStore, fixed: ContractOptions): {
    store: Store;
    options: ContractOptions;
};
/** Throw when a contract expectation fails. Runner-agnostic `assert`. */
export declare function check(condition: boolean, message: string): asserts condition;
export declare function skip(reason: string): never;
/** A key no other case, run or process shares. */
export declare function uniqueKey(label: string): Key;
export declare function newToken(): string & import("zod").$brand<"lock.owner">;
export declare function leaseTtl(store: Store, options: ContractOptions): number | undefined;
/** `ttlMs` for lease stores; nothing for hold stores. */
export declare function requestFor(store: Store, options: ContractOptions, overrides?: {
    ttlMs?: number;
}): {
    token: LockToken;
    ttlMs?: number;
};
export declare function grab(store: Store, key: Key, options: ContractOptions): Promise<Grant>;
export type CaseContext = {
    readonly store: Store;
    readonly locks: Locks<Store>;
    readonly options: ContractOptions;
};
/** Build one case: fresh store per run, disposed afterwards. */
export declare function defineCase(name: string, makeStore: MakeStore, options: ContractOptions, body: (context: CaseContext) => Promise<void>): ContractCase;
/** The `semaphore` factory, when the manager exposes it. A type guard, because `Locks<Store>` gates it on a literal `true`. */
export declare function hasSemaphore(locks: object): locks is {
    semaphore(key: string, config: SemaphoreConfig): SemaphoreHandle<Store>;
};
/** The `readWrite` factory, when the manager exposes it. */
export declare function hasReadWrite(locks: object): locks is {
    readWrite(key: string): ReadWriteHandle<Store>;
};
/** The runner-agnostic cases. Run each `run()` yourself, or use `describeStoreContract`. */
export declare function storeContract(makeStore: MakeStore, options?: ContractOptions): ContractCase[];
//# sourceMappingURL=contract.d.ts.map