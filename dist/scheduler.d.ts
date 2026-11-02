/**
 * The one seam for time and timers. Renewal and deadline timers pass
 * `ref: false` (they must not keep a process alive); a `wait` the caller
 * awaits passes `ref: true` (a CLI waiting for a lock must not exit).
 * Tests inject `manualScheduler()` from `@arki/lock/testing`.
 */
/** Opaque token for a pending timer. */
export type SchedulerHandle = {
    readonly id: number;
};
export type Scheduler = {
    /** Milliseconds on a monotonic clock. Only differences mean anything. */
    now(): number;
    /** Run `cb` after `ms`. `ref: true` keeps the process alive where the runtime supports it; default `false`. */
    setTimeout(cb: () => unknown, ms: number, opts?: {
        readonly ref?: boolean;
    }): SchedulerHandle;
    clearTimeout(handle: SchedulerHandle): void;
};
/** Global timers (unref'd unless `ref: true`) and `performance.now()`. */
export declare const defaultScheduler: Scheduler;
/** A caller-provided synchronous scheduler is a foreign boundary, including rejected invalid returns. */
export declare function supervisedScheduler(scheduler: Scheduler): Scheduler;
/** The synchronous clock protocol is foreign; preserve rejected/throwing provider defects privately. */
export declare function readClock(read: Scheduler['now']): number;
//# sourceMappingURL=scheduler.d.ts.map