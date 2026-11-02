import { z } from 'zod';
import type { LockFence, LockKey } from './identities.js';
/** Validates the names that the canonical encoder accepts. */
export declare const keyNameSchema: z.ZodString;
/** Typed decoding is shared by the full-key and metadata schemas. */
export declare function decodeKey(text: string): {
    namespace: string;
    name: string;
} | undefined;
/** Restores a versioned key identity without changing persisted bytes. */
export declare const lockKeySchema: z.ZodCustom<LockKey, LockKey>;
/** Restores an owner token; tokens intentionally have no backend-specific format. */
export declare const lockTokenSchema: z.core.$ZodBranded<z.ZodTemplateLiteral<string>, "lock.owner", "out">;
/** Restores a generation read from its owning store. */
export declare const lockFenceSchema: z.ZodCustom<LockFence, LockFence>;
//# sourceMappingURL=identity-schemas.d.ts.map