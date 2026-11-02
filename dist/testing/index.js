/** `@arki/lock/testing`: a manual scheduler, an in-memory store with any store's guarantees, the store conformance suite, chaos hooks and the replica property. */
import { describe, it } from 'vitest';
import { ContractSkip, storeContract } from './contract.js';
export { memoryStore } from '../memory.js';
export { chaos } from './chaos.js';
export { ContractSkip, storeContract } from './contract.js';
export { manualScheduler } from './manual-scheduler.js';
export { replicaCases } from './replicas.js';
export { testStore } from './test-store.js';
/** Register cases with vitest; a case that throws {@link ContractSkip} is reported skipped with its reason. */
export function describeCases(name, cases) {
    describe(name, () => {
        for (const contractCase of cases) {
            it(contractCase.name, async (context) => {
                try {
                    await contractCase.run();
                }
                catch (error) {
                    if (error instanceof ContractSkip)
                        context.skip(error.message);
                    throw error;
                }
            });
        }
    });
}
/** `storeContract` wrapped in a vitest `describe`. */
export function describeStoreContract(name, makeStore, options = {}) {
    describeCases(`${name} store contract`, storeContract(makeStore, options));
}
//# sourceMappingURL=index.js.map