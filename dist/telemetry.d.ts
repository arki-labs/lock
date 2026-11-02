/** Reporting must never change ownership, replay execution, or reject unobserved. */
export declare function report(observe: () => unknown): void;
/** Meaningful ownership boundaries, safe without an SDK and under defective providers. */
export declare function observeLock<T>(operation: string, execute: () => Promise<T>): Promise<T>;
//# sourceMappingURL=telemetry.d.ts.map