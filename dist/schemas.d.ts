import { z } from 'zod';
import type { LockError } from './errors.js';
/** A number of milliseconds, or a string with unit `ms`, `s`, `m` or `h`. No days or weeks on purpose. */
export declare const durationSchema: z.ZodUnion<readonly [z.ZodNumber, z.ZodTemplateLiteral<`${number}h` | `${number}m` | `${number}ms` | `${number}s`>]>;
export { keyNameSchema } from './identity-schemas.js';
/** The largest limit or weight: Postgres stores them as `integer`. */
/** A semaphore size: a positive integer. */
export declare const limitSchema: z.ZodNumber;
/** How many permits one hold takes: a positive integer. */
export declare const weightSchema: z.ZodNumber;
/** `storeTimeout` in milliseconds, at least 1. */
export declare const storeTimeoutSchema: z.ZodNumber;
/** What `semaphore(key, config)` takes. */
export declare const semaphoreConfigSchema: z.ZodObject<{
    limit: z.ZodNumber;
}, z.core.$strip>;
/** What a store promises. The types of every handle derive from this. */
export declare const guaranteesSchema: z.ZodReadonly<z.ZodObject<{
    kind: z.ZodEnum<{
        hold: "hold";
        lease: "lease";
    }>;
    scope: z.ZodEnum<{
        cluster: "cluster";
        host: "host";
        process: "process";
    }>;
    wait: z.ZodEnum<{
        native: "native";
        none: "none";
        poll: "poll";
        wake: "wake";
    }>;
    shared: z.ZodBoolean;
    permits: z.ZodBoolean;
    fence: z.ZodUnion<readonly [z.ZodEnum<{
        "best-effort": "best-effort";
        durable: "durable";
        process: "process";
    }>, z.ZodLiteral<false>]>;
    releasedOnCrash: z.ZodEnum<{
        "after-ttl": "after-ttl";
        immediate: "immediate";
    }>;
    clock: z.ZodEnum<{
        host: "host";
        none: "none";
        store: "store";
    }>;
    poolerSafe: z.ZodBoolean;
    releasedBy: z.ZodOptional<z.ZodEnum<{
        transaction: "transaction";
    }>>;
    writerPreference: z.ZodOptional<z.ZodBoolean>;
    runtimes: z.ZodReadonly<z.ZodArray<z.ZodEnum<{
        browser: "browser";
        bun: "bun";
        deno: "deno";
        hermes: "hermes";
        node: "node";
    }>>>;
}, z.core.$strip>>;
/** Canonical, length-delimited, versioned key. Built by `createKey`; see `key.ts`. */
export declare const keySchema: z.ZodReadonly<z.ZodObject<{
    namespace: z.ZodString;
    name: z.ZodString;
    full: z.ZodCustom<import("./identities.js").LockKey, import("./identities.js").LockKey>;
}, z.core.$strip>>;
/** What a store returns for a successful attempt. */
export declare const grantSchema: z.ZodReadonly<z.ZodObject<{
    key: z.ZodReadonly<z.ZodObject<{
        namespace: z.ZodString;
        name: z.ZodString;
        full: z.ZodCustom<import("./identities.js").LockKey, import("./identities.js").LockKey>;
    }, z.core.$strip>>;
    token: z.core.$ZodBranded<z.ZodTemplateLiteral<string>, "lock.owner", "out">;
    fence: z.ZodOptional<z.ZodCustom<import("./identities.js").LockFence, import("./identities.js").LockFence>>;
    expiresAt: z.ZodOptional<z.ZodNumber>;
    conn: z.ZodOptional<z.ZodUnknown>;
    lost: z.ZodOptional<z.ZodCustom<Promise<LockError>, Promise<LockError>>>;
}, z.core.$strip>>;
export declare const clockValueSchema: z.ZodNumber;
//# sourceMappingURL=schemas.d.ts.map