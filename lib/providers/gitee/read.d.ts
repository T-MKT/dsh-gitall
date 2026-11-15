/** Reads Gitee pull requests through `gitee api`. */
import type { ChangeRequestKey, ChangeRequestRef, ChangeRequestSnapshot, ForgeFailure, ForgeReadiness, ForgeRepository } from '@deepseek-ai/dsh-experimental-forge';
import type { CliRunner } from '../../core/cli.js';
/** Reads pull requests of the configured Gitee hosts. */
export declare class GiteeReader {
    private readonly run;
    private readonly hosts;
    /**
     * @param run - runner for `gitee`.
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
     * @throws when the host is not configured or Gitee refuses the read.
     */
    findByHead(repository: ForgeRepository, branch: string, signal: AbortSignal): Promise<readonly ChangeRequestRef[]>;
    /**
     * Read the changes of a pull request at `headSha`.
     * @param ref - pull request to read.
     * @param headSha - head commit the patch must describe.
     * @param signal - cancellation of the read.
     * @returns the patch, or why Gitee did not provide it at `headSha`.
     */
    diff(ref: ChangeRequestRef, headSha: string, signal: AbortSignal): Promise<string | ForgeFailure>;
    /**
     * Read one file at a commit through the contents endpoint.
     * @param ref - pull request whose repository is read.
     * @param commit - commit object name.
     * @param path - path relative to the repository root.
     * @param signal - cancellation of the read.
     * @returns the decoded file text, or why Gitee did not provide it.
     */
    fileText(ref: ChangeRequestRef, commit: string, path: string, signal: AbortSignal): Promise<string | ForgeFailure>;
    /**
     * Report whether `gitee` is signed in to a host.
     * @param host - Gitee host to probe.
     * @param signal - cancellation of the probe.
     * @returns readiness for that host.
     */
    readiness(host: string, signal: AbortSignal): Promise<ForgeReadiness>;
    private fetchOne;
    private readPullRequest;
    private readFiles;
    /** Run one reading `gitee` command, returning its stdout or why it failed. */
    private execute;
    private checkedHost;
}
