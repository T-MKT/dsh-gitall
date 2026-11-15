/** Changes GitLab merge requests through `glab`. */
import type { ForgeActionFailure, MergeRequest } from '@deepseek-ai/dsh-experimental-forge';
import type { ChangeRequestRef } from '@deepseek-ai/dsh-experimental-forge';
import type { CliRunner } from '../../core/cli.js';
/** Changes merge requests of the configured GitLab hosts. */
export declare class GitLabWriter {
    private readonly run;
    private readonly hosts;
    /**
     * @param run - runner for `glab`.
     * @param hosts - lowercase hosts this provider serves.
     */
    constructor(run: CliRunner, hosts: ReadonlySet<string>);
    /**
     * Mark a draft merge request ready for review.
     * @param ref - merge request to update.
     * @param signal - cancellation of the request.
     * @returns undefined once GitLab accepted it, or why it did not.
     */
    markReady(ref: ChangeRequestRef, signal: AbortSignal): Promise<ForgeActionFailure | undefined>;
    /**
     * Merge a merge request while its head is still `request.headSha`.
     * @param ref - merge request to merge.
     * @param request - merge method and the confirmed head commit.
     * @param signal - cancellation of the request.
     * @returns undefined once GitLab merged it, or why it did not.
     */
    merge(ref: ChangeRequestRef, request: MergeRequest, signal: AbortSignal): Promise<ForgeActionFailure | undefined>;
    /** Run one changing `glab` command; a refusal becomes an action failure. */
    private act;
}
