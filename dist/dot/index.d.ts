/**
 * `locks(...)` — the lock manager as a Dot unit.
 *
 * Features that need `locks` get the handle at boot, and the store's `dispose`
 * runs when the app stops. The handle is typed by the store's guarantees
 * (`LocksFor<G>`), so `lead`, `semaphore` and `readWrite` exist only when the
 * store can do them, and a test can provide any store with the same guarantees
 * (`testStore` from `@arki/lock/testing`).
 */
import type { CtxOf, EmptyShape, NeedsShape, NoReservedKeys } from '@arki/dot/unit';
import type { CreateLocksOptions, Guarantees, Store } from '../types.js';
/** What `locks(...)` takes. `store` builds the store from the services named in `needs`. */
export type LocksPluginOptions<TShape extends NeedsShape, S extends Store> = {
    /** Prefix for every key, so two apps on one backend never collide. */
    readonly namespace: string;
    /** Services the store factory reads, e.g. `{ db: database.provides.db }`. */
    readonly needs?: TShape;
    readonly store: (deps: CtxOf<TShape>) => S;
    /** Allow a process-scope store in production. Only right for a single-replica app. */
    readonly allowProcessScope?: boolean;
    readonly storeTimeout?: CreateLocksOptions<S>['storeTimeout'];
    readonly onReleaseError?: CreateLocksOptions<S>['onReleaseError'];
};
/**
 * Publish `locks`. The store is built, checked and wrapped at boot; a bad store fails the boot.
 *
 * @example
 * ```ts
 * defineApp('billing').infra(locks({ namespace: 'billing', needs: { db }, store: ({ db }) => pgLease(db) }));
 * ```
 */
export declare function locks<G extends Guarantees, TShape extends NeedsShape & NoReservedKeys = EmptyShape>(options: LocksPluginOptions<TShape, Store<G>>): Omit<import("@arki/dot/unit").Unit<import("@arki/dot/unit").WireNeeds<TShape>, import("@arki/dot/unit").ProvidedValues<{
    locks: {
        readonly store: Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
            method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
            outcome: "not-acquired" | "unknown";
            timeoutMs?: number | undefined;
        }>>;
        readonly namespace: string;
        readonly counters: import("../types.js").LockCounters;
        mutex(key: string): import("../types.js").MutexHandle<Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
            method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
            outcome: "not-acquired" | "unknown";
            timeoutMs?: number | undefined;
        }>>>;
    } & (Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
        method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
        outcome: "not-acquired" | "unknown";
        timeoutMs?: number | undefined;
    }>>["guarantees"]["permits"] extends true ? {
        semaphore(key: string, config: import("../types.js").SemaphoreConfig): import("../types.js").SemaphoreHandle<Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
            method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
            outcome: "not-acquired" | "unknown";
            timeoutMs?: number | undefined;
        }>>>;
    } : unknown) & (Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
        method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
        outcome: "not-acquired" | "unknown";
        timeoutMs?: number | undefined;
    }>>["guarantees"]["shared"] extends true ? {
        readWrite(key: string): import("../types.js").ReadWriteHandle<Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
            method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
            outcome: "not-acquired" | "unknown";
            timeoutMs?: number | undefined;
        }>>>;
    } : unknown);
}>, TShape, "locks", import("@arki/dot/unit").EmptyOwnership, import("@arki/dot/unit").EmptyPhases>, "factories" | "hooks" | "logging"> & import("@arki/dot/unit").LoggingSlot<import("@arki/dot/unit").DotLoggingHandle<undefined>> & import("@arki/dot/unit").FactoryContract<import("@arki/dot/unit").ProvidedValues<{
    locks: {
        readonly store: Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
            method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
            outcome: "not-acquired" | "unknown";
            timeoutMs?: number | undefined;
        }>>;
        readonly namespace: string;
        readonly counters: import("../types.js").LockCounters;
        mutex(key: string): import("../types.js").MutexHandle<Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
            method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
            outcome: "not-acquired" | "unknown";
            timeoutMs?: number | undefined;
        }>>>;
    } & (Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
        method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
        outcome: "not-acquired" | "unknown";
        timeoutMs?: number | undefined;
    }>>["guarantees"]["permits"] extends true ? {
        semaphore(key: string, config: import("../types.js").SemaphoreConfig): import("../types.js").SemaphoreHandle<Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
            method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
            outcome: "not-acquired" | "unknown";
            timeoutMs?: number | undefined;
        }>>>;
    } : unknown) & (Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
        method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
        outcome: "not-acquired" | "unknown";
        timeoutMs?: number | undefined;
    }>>["guarantees"]["shared"] extends true ? {
        readWrite(key: string): import("../types.js").ReadWriteHandle<Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
            method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
            outcome: "not-acquired" | "unknown";
            timeoutMs?: number | undefined;
        }>>>;
    } : unknown);
}>> & {
    readonly factories: {
        readonly locks: (ctx: never) => {
            readonly store: Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
                method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
                outcome: "not-acquired" | "unknown";
                timeoutMs?: number | undefined;
            }>>;
            readonly namespace: string;
            readonly counters: import("../types.js").LockCounters;
            mutex(key: string): import("../types.js").MutexHandle<Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
                method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
                outcome: "not-acquired" | "unknown";
                timeoutMs?: number | undefined;
            }>>>;
        } & (Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
            method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
            outcome: "not-acquired" | "unknown";
            timeoutMs?: number | undefined;
        }>>["guarantees"]["permits"] extends true ? {
            semaphore(key: string, config: import("../types.js").SemaphoreConfig): import("../types.js").SemaphoreHandle<Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
                method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
                outcome: "not-acquired" | "unknown";
                timeoutMs?: number | undefined;
            }>>>;
        } : unknown) & (Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
            method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
            outcome: "not-acquired" | "unknown";
            timeoutMs?: number | undefined;
        }>>["guarantees"]["shared"] extends true ? {
            readWrite(key: string): import("../types.js").ReadWriteHandle<Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
                method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
                outcome: "not-acquired" | "unknown";
                timeoutMs?: number | undefined;
            }>>>;
        } : unknown);
    };
    readonly hooks: import("@arki/dot/unit").PhaseHooks<never, {
        readonly configure: undefined;
        readonly start: undefined;
        readonly stop: undefined;
        readonly dispose: undefined;
    }, import("@arki/dot/unit").DotConfigureContext> & import("@arki/dot/unit").BootSlot<CtxOf<TShape> & import("@arki/dot/unit").ProvidedValues<{
        locks: {
            readonly store: Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
                method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
                outcome: "not-acquired" | "unknown";
                timeoutMs?: number | undefined;
            }>>;
            readonly namespace: string;
            readonly counters: import("../types.js").LockCounters;
            mutex(key: string): import("../types.js").MutexHandle<Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
                method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
                outcome: "not-acquired" | "unknown";
                timeoutMs?: number | undefined;
            }>>>;
        } & (Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
            method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
            outcome: "not-acquired" | "unknown";
            timeoutMs?: number | undefined;
        }>>["guarantees"]["permits"] extends true ? {
            semaphore(key: string, config: import("../types.js").SemaphoreConfig): import("../types.js").SemaphoreHandle<Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
                method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
                outcome: "not-acquired" | "unknown";
                timeoutMs?: number | undefined;
            }>>>;
        } : unknown) & (Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
            method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
            outcome: "not-acquired" | "unknown";
            timeoutMs?: number | undefined;
        }>>["guarantees"]["shared"] extends true ? {
            readWrite(key: string): import("../types.js").ReadWriteHandle<Store<G, import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
                method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
                outcome: "not-acquired" | "unknown";
                timeoutMs?: number | undefined;
            }>>>;
        } : unknown);
    }> & import("@arki/dot/unit").KernelCtx, undefined>;
} & import("@arki/dot/unit").InfraRole;
/** What a lock service is backed by, for `dot explain` text. */
export type LocksDescription = {
    readonly store: string;
    readonly kind: Store['guarantees']['kind'];
    readonly scope: Store['guarantees']['scope'];
    readonly fence: Store['guarantees']['fence'];
    readonly releasedOnCrash: Store['guarantees']['releasedOnCrash'];
};
/** Name the store behind a lock service and what it promises. */
export declare function describeLocks(service: {
    readonly store: Store;
}): LocksDescription;
//# sourceMappingURL=index.d.ts.map