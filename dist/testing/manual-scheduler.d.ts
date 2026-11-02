/**
 * A scheduler you drive by hand. It is the one seam for time and timers, so a
 * test moves the clock with `advance` and nothing else moves it.
 * An instance you do not advance is a paused process: its timers never fire.
 */
import type { Scheduler } from '../scheduler.js';
import type { Duration } from '../types.js';
export type ManualScheduler = Scheduler & {
    /**
     * Move the clock forward. Fires every timer due on the way, in order, each
     * at its own time. Awaits a promise a callback returns (a renewal in flight),
     * then lets pending microtasks settle. The target is fixed when you call it.
     * Do not await it when a callback hangs on purpose.
     */
    advance(duration: Duration): Promise<void>;
    /** How many timers are waiting to fire. */
    readonly pendingTimers: number;
};
/** `ref` is accepted and ignored: nothing here keeps a process alive. */
export declare function manualScheduler(start?: number): ManualScheduler;
//# sourceMappingURL=manual-scheduler.d.ts.map