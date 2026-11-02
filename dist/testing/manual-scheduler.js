import { parseDuration } from '../wait.js';
async function settle() {
    for (let tick = 0; tick < 200; tick++)
        await Promise.resolve();
}
/** `ref` is accepted and ignored: nothing here keeps a process alive. */
export function manualScheduler(start = 0) {
    let now = start;
    let nextId = 0;
    const timers = new Map();
    /** The earliest timer due by `target`; ties go to the one set first. */
    function nextDue(target) {
        let found;
        for (const [id, timer] of timers) {
            if (timer.at > target)
                continue;
            if (found === undefined || timer.at < found.timer.at)
                found = { id, timer };
        }
        return found;
    }
    return {
        now: () => now,
        setTimeout(cb, ms) {
            const id = nextId++;
            timers.set(id, { at: now + Math.max(0, ms), cb });
            return { id };
        },
        clearTimeout(handle) {
            timers.delete(handle.id);
        },
        get pendingTimers() {
            return timers.size;
        },
        async advance(duration) {
            const target = now + parseDuration(duration);
            for (;;) {
                await settle();
                const due = nextDue(target);
                if (due === undefined)
                    break;
                timers.delete(due.id);
                now = Math.max(now, due.timer.at);
                await due.timer.cb();
            }
            await settle();
            now = Math.max(now, target);
        },
    };
}
//# sourceMappingURL=manual-scheduler.js.map