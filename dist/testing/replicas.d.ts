import type { ContractCase, MakeStore } from './contract.js';
import type { ManualScheduler } from './manual-scheduler.js';
export type ReplicaOptions = {
    /** The clock the store was built with. Default: a fresh one (right for stores with no clock of their own). */
    readonly scheduler?: ManualScheduler;
    /** fast-check runs. Default 50. */
    readonly numRuns?: number;
    /** Fixed seed, to replay a failure. */
    readonly seed?: number;
};
export declare function replicaCases(makeStore: MakeStore, options?: ReplicaOptions): ContractCase[];
//# sourceMappingURL=replicas.d.ts.map