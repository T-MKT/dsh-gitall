/** Composes per-file diffs into one unified patch with `a/` and `b/` path prefixes. */
/** One changed file as a host reports it. */
export interface FileDiff {
    /** Path on the old side. */
    readonly oldPath: string;
    /** Path on the new side. */
    readonly newPath: string;
    /** Hunk text as the host prints it, starting with `@@`. */
    readonly body: string;
    /** Whether the file is added by the change request. */
    readonly newFile?: boolean;
    /** Whether the file is removed by the change request. */
    readonly deletedFile?: boolean;
}
/**
 * Compose one unified patch.
 * @param files - changed files in host order.
 * @returns the patch, one `diff --git` section per file, with `/dev/null` on the missing side of an added or removed file.
 */
export declare function unifiedPatch(files: readonly FileDiff[]): string;
