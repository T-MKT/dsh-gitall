/** Reads GitLab merge requests through `glab api`. */
import type { ChangeRequestKey, ChangeRequestRef, ChangeRequestSnapshot, ForgeFailure, ForgeReadiness, ForgeRepository } from '@deepseek-ai/dsh-experimental-forge';
import type { CliRunner } from '../../core/cli.js';
/** Reads merge requests of the configured GitLab hosts. */
export declare class GitLabReader {
    private readonly run;
    private readonly hosts;
    /**
     * @param run - runner for `glab`.
     * @param hosts - lowercase hosts this provider serves.
     */
    constructor(run: CliRunner, hosts: ReadonlySet<string>);
    /**
     * Read the status of several merge requests.
     * @param refs - merge requests to read.
     * @param signal - cancellation of the read.
     * @returns one result per requested merge request.
     */
    fetch(refs: readonly ChangeRequestRef[], signal: AbortSignal): Promise<ReadonlyMap<ChangeRequestKey, ChangeRequestSnapshot | ForgeFailure>>;
    /**
     * Find open merge requests whose source is `branch`.
     * @param repository - repository to search.
     * @param branch - source branch name.
     * @param signal - cancellation of the read.
     * @returns matching merge requests, newest first.
     * @throws when the host is not configured or GitLab refuses the read.
     */
    findByHead(repository: ForgeRepository, branch: string, signal: AbortSignal): Promise<readonly ChangeRequestRef[]>;
    /**
     * Read the changes of a merge request at `headSha`.
     * @param ref - merge request to read.
     * @param headSha - head commit the patch must describe.
     * @param signal - cancellation of the read.
     * @returns the patch, or why GitLab did not provide it at `headSha`.
     */
    diff(ref: ChangeRequestRef, headSha: string, signal: AbortSignal): Promise<string | ForgeFailure>;
    /**
     * Read one file at a commit through the raw file endpoint.
     * @param ref - merge request whose repository is read.
     * @param commit - commit object name.
     * @param path - path relative to the repository root.
     * @param signal - cancellation of the read.
     * @returns the file text, or why GitLab did not provide it.
     */
    fileText(ref: ChangeRequestRef, commit: string, path: string, signal: AbortSignal): Promise<string | ForgeFailure>;
    /**
     * Report whether `glab` is signed in to a host.
     * @param host - GitLab host to probe.
     * @param signal - cancellation of the probe.
     * @returns readiness for that host.
     */
    readiness(host: string, signal: AbortSignal): Promise<ForgeReadiness>;
    private fetchOne;
    private readMergeRequest;
    private readDiffs;
    /** Run one reading `glab` command, returning its stdout or why it failed. */
    private execute;
    private checkedHost;
}
