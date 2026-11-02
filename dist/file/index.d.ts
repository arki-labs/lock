import type { Scheduler } from '../scheduler.js';
import type { Key, Store } from '../types.js';
/** What `fileStore` promises. */
export declare const fileGuarantees: {
    readonly kind: 'lease';
    readonly scope: 'host';
    readonly wait: 'poll';
    readonly shared: false;
    readonly permits: false;
    readonly fence: false;
    readonly releasedOnCrash: 'after-ttl';
    readonly clock: 'host';
    readonly poolerSafe: true;
    readonly runtimes: readonly ["node", "bun", "deno"];
};
export type FileGuarantees = typeof fileGuarantees;
export type FileStoreOptions = {
    /** A lock whose mtime is older than this is dead and may be taken over. It is the lease length. Default 10 s. */
    readonly stale?: number;
    /** How often a blocked `waitFor` looks again when `fs.watch` says nothing. Default 250 ms. */
    readonly pollMs?: number;
    /** Wall-clock milliseconds, compared with file mtimes. Default `Date.now`. Tests move it. */
    readonly now?: () => number;
    /** Timers for `waitFor`. Default: the global timers. */
    readonly scheduler?: Scheduler;
};
export type FileStore = Store<FileGuarantees> & {
    /** The lock directory of `key`. For tests and debugging. */
    lockPath(key: Key): string;
};
export declare function fileStore(dir: string, options?: FileStoreOptions): FileStore;
//# sourceMappingURL=index.d.ts.map