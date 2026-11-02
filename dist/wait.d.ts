/**
 * Waiting helpers: duration parsing, backoff, abort racing and the store-call
 * timeout. Portable: only `AbortSignal` and the `Scheduler` seam.
 */
import type { LockMethod } from './errors.js';
import type { Scheduler } from './scheduler.js';
import type { Duration } from './types.js';
/** A {@link Duration} in milliseconds. Throws `LockError{code:'config'}` for anything else. */
export declare function parseDuration(duration: Duration): number;
export declare const BACKOFF_FIRST_MS = 50;
export declare const BACKOFF_MAX_MS = 1000;
/**
 * Full-jitter backoff: a uniform delay in `[0, cap)`, with `cap` doubling from
 * 50 ms to 1 s. `attempt` counts from 0. `random` is injectable for tests.
 */
export declare function backoffDelay(attempt: number, random?: () => number): number;
/**
 * Settle with `promise`, or reject with `LockError{code:'aborted'}` as soon as
 * `signal` aborts. The listener is removed either way. A late result of
 * `promise` is the caller's to clean up.
 */
export declare function raceSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T>;
/** What {@link answerSoFar} gives for a store call still in flight. */
export declare const NOT_YET: unique symbol;
/**
 * The store's answer if it is already in (an in-process store answers inside the call),
 * else {@link NOT_YET}. One microtask, no timer: only a call still in flight needs
 * {@link storeAnswer}'s timer and abort race. A store's rejection passes through.
 */
export declare function answerSoFar<T>(promise: Promise<T>): Promise<T | typeof NOT_YET>;
/**
 * {@link withStoreTimeout}, raced with `signal` when given. A call that has already
 * answered needs neither a timer nor an abort listener, so it gets none; a signal that
 * aborted meanwhile still wins.
 */
export declare function storeAnswer<T>(promise: Promise<T>, ms: number, method: LockMethod, scheduler?: Scheduler, signal?: AbortSignal): Promise<T>;
/**
 * Settle with `promise`, or reject with `LockError{code:'store', outcome:'unknown', method, timeoutMs}`
 * after `ms`. A call that timed out may still have taken the lock, so the
 * outcome is `unknown`, never "free". The caller decides what to do when
 * `promise` settles late; a late rejection is already handled here.
 */
export declare function withStoreTimeout<T>(promise: Promise<T>, ms: number, method: LockMethod, scheduler?: Scheduler): Promise<T>;
//# sourceMappingURL=wait.d.ts.map