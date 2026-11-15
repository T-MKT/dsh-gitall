/** Changes Gitee pull requests through `gitee api`. */
import type { ChangeRequestRef, ForgeActionFailure, MergeRequest } from '@deepseek-ai/dsh-experimental-forge';
import type { CliRunner } from '../../core/cli.js';
/** Changes pull requests of the configured Gitee hosts. */
export declare class GiteeWriter {
    private readonly run;
    private readonly hosts;
    /**
     * @param run - runner for `gitee`.
     * @param hosts - lowercase hosts this provider serves.
     */
    constructor(run: CliRunner, hosts: ReadonlySet<string>);
    /**
     * Clear a pull request's draft flag.
     * @param ref - pull request to update.
     * @param signal - cancellation of the request.
     * @returns undefined once Gitee accepted it, or why it did not.
     */
    markReady(ref: ChangeRequestRef, signal: AbortSignal): Promise<ForgeActionFailure | undefined>;
    /**
     * Merge a pull request while its head is still `request.headSha`. Gitee's
     * merge endpoint cannot name the confirmed head, so the head is read first.
     * @param ref - pull request to merge.
     * @param request - merge method and the confirmed head commit.
     * @param signal - cancellation of the request.
     * @returns undefined once Gitee merged it, or why it did not.
     */
    merge(ref: ChangeRequestRef, request: MergeRequest, signal: AbortSignal): Promise<ForgeActionFailure | undefined>;
    /** Read the current head commit, or why it could not be read. */
    private readHead;
    /** Run one changing `gitee` command; a refusal becomes an action failure. */
    private write;
}
