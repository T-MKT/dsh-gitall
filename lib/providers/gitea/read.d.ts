/** Reads Gitea pull requests through `gt api`. */
import type { ChangeRequestKey, ChangeRequestRef, ChangeRequestSnapshot, ForgeFailure, ForgeReadiness, ForgeRepository } from '@deepseek-ai/dsh-experimental-forge';
import type { CliRunner } from '../../core/cli.js';
/** Reads pull requests of the configured Gitea hosts. */
export declare class GiteaReader {
    private readonly run;
    private readonly hosts;
    /**
     * @param run - runner for `gt`.
     * @param hosts - lowercase hosts this provider serves.
     */
    constructor(run: CliRunner, hosts: ReadonlySet<string>);
    /**
     * Read the status of several pull requests.
     * @param refs - pull requests to read.
     * @param signal - cancellation of the read.
     * @returns one result per requested pull request.
     */
    fetch(refs: readonly ChangeRequestRef[], signal: AbortSignal): Promise<ReadonlyMap<ChangeRequestKey, ChangeRequestSnapshot | ForgeFailure>>;
    /**
     * Find open pull requests whose head is `branch`.
     * @param repository - repository to search.
     * @param branch - head branch name.
     * @param signal - cancellation of the read.
     * @returns matching pull requests, newest first.
     * @throws when the host is not configured or Gitea refuses the read.
     */
    findByHead(repository: ForgeRepository, branch: string, signal: AbortSignal): Promise<readonly ChangeRequestRef[]>;
    /**
     * Read the changes of a pull request at `headSha`.
     * @param ref - pull request to read.
     * @param headSha - head commit the patch must describe.
     * @param signal - cancellation of the read.
     * @returns the patch, or why Gitea did not provide it at `headSha`.
     */
    diff(ref: ChangeRequestRef, headSha: string, signal: AbortSignal): Promise<string | ForgeFailure>;
    /**
     * Read one file at a commit through the raw file endpoint.
     * @param ref - pull request whose repository is read.
     * @param commit - commit object name.
     * @param path - path relative to the repository root.
     * @param signal - cancellation of the read.
     * @returns the file text, or why Gitea did not provide it.
     */
    fileText(ref: ChangeRequestRef, commit: string, path: string, signal: AbortSignal): Promise<string | ForgeFailure>;
    /**
     * Report whether `gt` has a usable account for a host.
     * @param host - Gitea host to probe.
     * @param signal - cancellation of the probe.
     * @returns readiness for that host.
     */
    readiness(host: string, signal: AbortSignal): Promise<ForgeReadiness>;
    private fetchOne;
    private readPullRequest;
    /** Read the head commit's statuses; a failed read leaves the snapshot without checks. */
    private checksOf;
    /** Run one reading `gt` command, returning its stdout or why it failed. */
    private execute;
    private checkedHost;
}
