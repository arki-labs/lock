/**
 * Canonical keys. `full` is length-delimited and versioned, so two different
 * `(namespace, name)` pairs can never collide the way `${ns}:${name}` can
 * (`('a:b', 'c')` vs `('a', 'b:c')`). The digest is a pure-TS 64-bit FNV-1a, so
 * it runs on every runtime, Hermes included.
 *
 * Each primitive has its own encoding tag, so `mutex('a')`, `semaphore('a')` and
 * `readWrite('a')` are three independent locks on every store:
 *
 * - mutex:     `1:<len>:<ns>:<len>:<name>`   (unchanged: live apps depend on these digests)
 * - semaphore: `1s:<len>:<ns>:<len>:<name>`
 * - readWrite: `1rw:<len>:<ns>:<len>:<name>`
 */
import type { Key } from './types.js';
/** Which lock family a key names. Part of the encoding, so families never share a lock. */
declare const PRIMITIVE_TAGS: {
    readonly mutex: '1';
    readonly semaphore: '1s';
    readonly readWrite: '1rw';
};
export type Primitive = keyof typeof PRIMITIVE_TAGS;
/** Build the canonical key. Throws `LockError{code:'config'}` for an empty, oversized or ill-formed part. */
export declare function createKey(namespace: string, name: string, primitive?: Primitive): Key;
/** 64-bit FNV-1a over raw bytes, as an unsigned bigint. */
export declare function fnv1a64(bytes: Uint8Array): bigint;
/**
 * {@link fnv1a64} over the UTF-8 bytes of `text`, encoded inline exactly as `TextEncoder`
 * does: a lone surrogate becomes U+FFFD (EF BF BD).
 */
export declare function fnv1a64Utf8(text: string): bigint;
/** The 64-bit digest of `key.full` (UTF-8). */
export declare function digest64(key: Key): bigint;
/** The digest split into two signed 32-bit integers, the shape of `pg_advisory_lock(int4, int4)`. */
export declare function toPgPair(key: Key): {
    readonly hi: number;
    readonly lo: number;
};
/** The text today's code hashes with `hashtext(...)`, for `legacyKeys: true`. */
export declare function legacyPgText(key: Key): string;
export {};
//# sourceMappingURL=key.d.ts.map