import type { IdOf } from '@arki/contracts';
/** Canonical resource identity; its versioned encoding is unchanged across replicas. */
declare const lockKeyBrand: unique symbol;
export type LockKey = string & {
    readonly [lockKeyBrand]: true;
};
/** A distinct owner for one acquisition attempt, never a resource key. */
export declare const lockToken: import("@arki/contracts").BrandedIdDeclaration<"", "lock.owner">;
export type LockToken = IdOf<typeof lockToken>;
/** A generation accepted by the protected resource, never an owner token. */
declare const lockFenceBrand: unique symbol;
export type LockFence = bigint & {
    readonly [lockFenceBrand]: true;
};
export {};
//# sourceMappingURL=identities.d.ts.map