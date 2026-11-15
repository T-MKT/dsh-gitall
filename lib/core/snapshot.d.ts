/** Builds a provider-neutral change request snapshot from the fields one host reports. */
import type { ChangeRequestCheck, ChangeRequestRef, ChangeRequestSnapshot, ChecksRollup, MergeMethod, Mergeability } from '@deepseek-ai/dsh-experimental-forge';
/** Fields every host must report; the remaining sections of a snapshot take their unimplemented defaults. */
export interface SnapshotFields {
    /** Web page of the change request. */
    readonly url: string;
    /** Title as the author wrote it. */
    readonly title: string;
    /** Lifecycle state. */
    readonly state: ChangeRequestSnapshot['state'];
    /** Whether the author marked the change request as a draft. */
    readonly draft: boolean;
    /** Author login, or null when the host hides it. */
    readonly author: string | null;
    /** Branch that carries the proposed commits. */
    readonly headBranch: string;
    /** Commit object name at the head of the change request. */
    readonly headSha: string;
    /** Branch the change request merges into. */
    readonly baseBranch: string;
    /** Base commit the host recorded with `headSha`, when it reports one. */
    readonly baseSha?: string;
    /** Lines the change request adds. */
    readonly additions: number;
    /** Lines the change request deletes. */
    readonly deletions: number;
    /** Merge conflict status. */
    readonly mergeability: Mergeability;
    /** Whether the host would merge the change request now for the signed-in user. */
    readonly mergeReady: boolean;
    /** Merge methods the repository accepts. */
    readonly mergeMethods: readonly MergeMethod[];
    /** Checks on the head commit in host order. */
    readonly checks: readonly ChangeRequestCheck[];
    /** ISO 8601 time of the host's last update. */
    readonly updatedAt: string;
    /** ISO 8601 time the change request was merged or closed, or null while it is open. */
    readonly closedAt: string | null;
}
/**
 * Build a snapshot, filling every section these providers do not read with its
 * unimplemented default.
 * @param ref - change request the snapshot describes.
 * @param fields - fields the host reported.
 * @returns the complete snapshot.
 */
export declare function snapshotOf(ref: ChangeRequestRef, fields: SnapshotFields): ChangeRequestSnapshot;
/**
 * Combine the outcomes of all checks.
 * @param checks - checks on the head commit, in host order.
 * @returns `none` without checks, `failure` when any failed, `pending` when any is still running, and `success` otherwise.
 */
export declare function checksRollupOf(checks: readonly ChangeRequestCheck[]): ChecksRollup;
