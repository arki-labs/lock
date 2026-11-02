import type { FailureOf } from '@arki/failure';
/**
 * The lock was busy: the one attempt was refused, or the wait ended with the
 * lock still held. `key` is the full key, present only when the manager was
 * made with `logKeys: true` (raw keys stay out of logs by default).
 * `waitedMs` is 0 for `tryRun` and `tryAcquire`.
 *
 * @fix Skip the work, or retry later. Pass a longer `wait` to `run` or `acquire` when the holder is usually quick.
 * @verify bun run test -- src/locks.test.ts
 */
export declare const LockHeld: import("@arki/failure").FailureDefinition<"lock.held", import("@standard-schema/spec").StandardSchemaV1<{
    key?: string | undefined;
    waitedMs: number;
}, {
    key?: string | undefined;
    waitedMs: number;
}>>;
/** A {@link LockHeld} failure value. */
export type LockHeld = ReturnType<typeof LockHeld>;
/** Stable ids, one per `LockError.code`. Never renumber. `ARKI_LOCK_E001` was `held`, now the {@link LockHeld} failure. */
export declare const LOCK_ERROR_CODES: {
    /**
     * The caller's signal aborted the wait; the callback never ran.
     *
     * @fix Stop. The caller asked to cancel, so do not retry with the same signal.
     * @verify bun run test -- src/wait.test.ts
     */
    readonly aborted: 'ARKI_LOCK_E002';
    /**
     * Ownership was lost while the callback ran. The callback may have had side effects; nothing retries it.
     *
     * @fix Check what the callback finished before running it again. Pass the lock's `signal` to the work so it stops early, and use the fence for writes.
     * @verify bun run test -- src/locks.test.ts
     */
    readonly lost: 'ARKI_LOCK_E003';
    /**
     * Backend failure. Never treated as free or held.
     *
     * @fix Check the store (database, Redis or file system). When `outcome` is `unknown`, ownership may exist remotely, so wait for the lease to expire before you assume the key is free.
     * @verify bun run test -- src/locks.test.ts
     */
    readonly store: 'ARKI_LOCK_E004';
    /**
     * `guard.release()` failed or reported `unknown`. `run` and `tryRun` never throw this after a successful callback.
     *
     * @fix Check the store. On a lease store the key frees itself after `ttl`. Count these with `locks.counters.releaseErrors`.
     * @verify bun run test -- src/locks.test.ts
     */
    readonly release: 'ARKI_LOCK_E005';
    /**
     * Bad input or setup: empty key, bad duration, conflicting semaphore limit, session store on a pooled shape.
     *
     * @fix Fix the call named in the message: pass a non-empty key, a valid duration, one limit per semaphore key, and a single connection to a session store.
     * @verify bun run test -- src/key.test.ts
     */
    readonly config: 'ARKI_LOCK_E006';
    /**
     * A store lacks a capability the types could not see. Nothing throws this today.
     *
     * @fix Use a store that declares the capability in its `guarantees`.
     * @verify bun run test -- src/locks.test.ts
     */
    readonly unsupported: 'ARKI_LOCK_E007';
};
/** Which failure a {@link LockError} is. */
export type LockErrorCode = keyof typeof LOCK_ERROR_CODES;
/** What a {@link LockError} is built from. */
export type LockErrorInit = {
    readonly code: LockErrorCode;
    readonly message: string;
    /** What to do about it, in one sentence. */
    readonly remediation: string;
    readonly cause?: unknown;
    /** On `store`: whether ownership might exist remotely. */
    readonly outcome?: ReturnType<typeof LockStoreFailure>['data']['outcome'];
    /** On `lost`: the store refused a renewal, the local deadline passed, or the pinned connection closed. */
    readonly detectedBy?: ReturnType<typeof LockLost>['data']['detectedBy'];
    /** On `store` and `release`: which store call failed. */
    readonly method?: Exclude<ReturnType<typeof LockStoreFailure>['data']['method'], 'ddl' | 'dispose'>;
    /** On `store`: set when `storeTimeout` fired. */
    readonly timeoutMs?: number;
    /** Lock-side errors that rode along with a callback error (the `using` convention). */
    readonly suppressed?: readonly Error[];
};
/** Which store call a {@link LockError} blames. */
export type LockMethod = NonNullable<LockErrorInit['method']>;
/** A thrown, coded error of `@arki/lock`: a bug, misuse, or a store fault. */
export declare class LockError extends Error {
    readonly code: LockErrorCode;
    /** The stable id of `code`, e.g. `ARKI_LOCK_E004`. */
    readonly errorCode: (typeof LOCK_ERROR_CODES)[LockErrorCode];
    readonly remediation: string;
    readonly outcome?: LockErrorInit['outcome'];
    readonly detectedBy?: LockErrorInit['detectedBy'];
    readonly method?: LockErrorInit['method'];
    readonly timeoutMs?: number;
    readonly suppressed?: readonly Error[];
    constructor(init: LockErrorInit);
}
/** Cancellation ended acquisition before callback execution.
 * @fix Stop waiting; do not replay work with the same cancelled signal.
 * @verify bun run test -- src/outcomes.test.ts
 */
export declare const LockAborted: import("@arki/failure").FailureDefinition<"lock.aborted", undefined>;
/** Ownership ended after work may have started. This never authorizes replay.
 * @fix Reconcile side effects and enforce fences before another attempt.
 * @verify bun run test -- src/locks.test.ts
 */
export declare const LockLost: import("@arki/failure").FailureDefinition<"lock.lost", import("@standard-schema/spec").StandardSchemaV1<{
    detectedBy: "connection" | "deadline" | "renewal";
}, {
    detectedBy: "connection" | "deadline" | "renewal";
}>>;
/** A backend operation failed with explicit ownership uncertainty.
 * @fix Reconcile unknown ownership before assuming the key is free.
 * @verify bun run test -- src/outcomes.test.ts
 */
export declare const LockStoreFailure: import("@arki/failure").FailureDefinition<"lock.store", import("@standard-schema/spec").StandardSchemaV1<{
    method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
    outcome: "not-acquired" | "unknown";
    timeoutMs?: number | undefined;
}, {
    method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
    outcome: "not-acquired" | "unknown";
    timeoutMs?: number | undefined;
}>>;
/** Release was not confirmed. Successful callback work must never be replayed on this evidence.
 * @fix Reconcile ownership or wait for the lease or connection to end.
 * @verify bun run test -- src/outcomes.test.ts
 */
export declare const LockReleaseFailed: import("@arki/failure").FailureDefinition<"lock.release", import("@standard-schema/spec").StandardSchemaV1<{
    outcome: "unknown";
}, {
    outcome: "unknown";
}>>;
/** Normalize an owned operation once; causes remain private failure metadata. */
export declare function lockFailure(error: unknown): import("@arki/failure").Failure<"contracts.random_source_unavailable", undefined> | import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.aborted", undefined> | import("@arki/failure").Failure<"lock.lost", {
    detectedBy: "connection" | "deadline" | "renewal";
}> | import("@arki/failure").Failure<"lock.store", {
    method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
    outcome: "not-acquired" | "unknown";
    timeoutMs?: number | undefined;
}>;
/** A named store owns its provider rejection, including unknown remote effects. */
export declare function storeFailure(error: unknown, method: ReturnType<typeof LockStoreFailure>['data']['method']): import("@arki/failure").Failure<"failure.unexpected_defect", undefined> | import("@arki/failure").Failure<"lock.store", {
    method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
    outcome: "not-acquired" | "unknown";
    timeoutMs?: number | undefined;
}>;
/** Every canonical operation outcome, with the original LockHeld definition retained. */
export declare const LOCK_RUN_FAILURES: readonly [import("@arki/failure").FailureDefinition<"lock.held", import("@standard-schema/spec").StandardSchemaV1<{
    key?: string | undefined;
    waitedMs: number;
}, {
    key?: string | undefined;
    waitedMs: number;
}>>, import("@arki/failure").FailureDefinition<"lock.aborted", undefined>, import("@arki/failure").FailureDefinition<"lock.lost", import("@standard-schema/spec").StandardSchemaV1<{
    detectedBy: "connection" | "deadline" | "renewal";
}, {
    detectedBy: "connection" | "deadline" | "renewal";
}>>, import("@arki/failure").FailureDefinition<"lock.store", import("@standard-schema/spec").StandardSchemaV1<{
    method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
    outcome: "not-acquired" | "unknown";
    timeoutMs?: number | undefined;
}, {
    method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
    outcome: "not-acquired" | "unknown";
    timeoutMs?: number | undefined;
}>>, import("@arki/failure").FailureDefinition<"contracts.random_source_unavailable", undefined>, import("@arki/failure").FailureDefinition<"failure.unexpected_defect", undefined>];
export declare const LOCK_FAILURES: readonly [import("@arki/failure").FailureDefinition<"lock.held", import("@standard-schema/spec").StandardSchemaV1<{
    key?: string | undefined;
    waitedMs: number;
}, {
    key?: string | undefined;
    waitedMs: number;
}>>, import("@arki/failure").FailureDefinition<"lock.aborted", undefined>, import("@arki/failure").FailureDefinition<"lock.lost", import("@standard-schema/spec").StandardSchemaV1<{
    detectedBy: "connection" | "deadline" | "renewal";
}, {
    detectedBy: "connection" | "deadline" | "renewal";
}>>, import("@arki/failure").FailureDefinition<"lock.store", import("@standard-schema/spec").StandardSchemaV1<{
    method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
    outcome: "not-acquired" | "unknown";
    timeoutMs?: number | undefined;
}, {
    method: "acquire" | "ddl" | "dispose" | "extend" | "permits" | "release" | "shared" | "waitFor";
    outcome: "not-acquired" | "unknown";
    timeoutMs?: number | undefined;
}>>, import("@arki/failure").FailureDefinition<"contracts.random_source_unavailable", undefined>, import("@arki/failure").FailureDefinition<"failure.unexpected_defect", undefined>, import("@arki/failure").FailureDefinition<"lock.release", import("@standard-schema/spec").StandardSchemaV1<{
    outcome: "unknown";
}, {
    outcome: "unknown";
}>>];
export type LockOperationFailure = ReturnType<typeof lockFailure>;
export type StoreFailure = ReturnType<typeof storeFailure>;
export type ReleaseFailure = ReturnType<typeof releaseFailure>;
/** Manual release exposes uncertainty without converting completed work into a replay request. */
export declare function releaseFailure(error: unknown): import("@arki/failure").Failure<"lock.release", {
    outcome: "unknown";
}>;
/** Exact run outcomes from their canonical definition source. */
export type LockRunFailure = FailureOf<(typeof LOCK_RUN_FAILURES)[number]>;
//# sourceMappingURL=errors.d.ts.map