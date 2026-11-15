/** Changes Gitea pull requests through `gt`. */
import type { ChangeRequestRef, ForgeActionFailure, MergeRequest } from '@deepseek-ai/dsh-experimental-forge';
import type { CliRunner } from '../../core/cli.js';
/** Changes pull requests of the configured Gitea hosts. */
export declare class GiteaWriter {
    private readonly run;
    private readonly hosts;
    /**
     * @param run - runner for `gt`.
     * @param hosts - lowercase hosts this provider serves.
     */
    constructor(run: CliRunner, hosts: ReadonlySet<string>);
    /**
     * Report that Gitea has no draft pull requests, so there is nothing to mark ready.
     * @param ref - pull request that would be marked ready.
     * @param signal - unused; no request is made.
     * @returns always a `failed` failure explaining the platform limit.
     */
    markReady(ref: ChangeRequestRef, signal: AbortSignal): Promise<ForgeActionFailure | undefined>;
    /**
     * Merge a pull request while its head is still `request.headSha`.
     * @param ref - pull request to merge.
     * @param request - merge method and the confirmed head commit.
     * @param signal - cancellation of the request.
     * @returns undefined once Gitea merged it, or why it did not.
     */
    merge(ref: ChangeRequestRef, request: MergeRequest, signal: AbortSignal): Promise<ForgeActionFailure | undefined>;
}
