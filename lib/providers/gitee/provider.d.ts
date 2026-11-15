/** Gitee implementation of the forge provider contract. */
import type { ChangeRequestKey, ChangeRequestRef, ChangeRequestSnapshot, ForgeActionFailure, ForgeFailure, ForgeProvider, ForgeReadiness, ForgeRepository, MergeRequest } from '@deepseek-ai/dsh-experimental-forge';
import type { CliRunner } from '../../core/cli.js';
import type { ForgeSettings } from '../../config.js';
/** Gitee pull request provider reading through `gitee`. */
export declare class GiteeProvider implements ForgeProvider {
    readonly forge = "gitee";
    private readonly hosts;
    private readonly reader;
    private readonly writer;
    /**
     * @param run - runner for `gitee`.
     * @param settings - executable and served hosts.
     */
    constructor(run: CliRunner, settings: ForgeSettings);
    repositoryFromRemote(url: string): ForgeRepository | undefined;
    changeRequestFromUrl(url: string): ChangeRequestRef | undefined;
    changeRequestUrl(ref: ChangeRequestRef): string;
    fetch(refs: readonly ChangeRequestRef[], signal: AbortSignal): Promise<ReadonlyMap<ChangeRequestKey, ChangeRequestSnapshot | ForgeFailure>>;
    findByHead(repository: ForgeRepository, branch: string, signal: AbortSignal): Promise<readonly ChangeRequestRef[]>;
    readiness(host: string, signal: AbortSignal): Promise<ForgeReadiness>;
    markReady(ref: ChangeRequestRef, signal: AbortSignal): Promise<ForgeActionFailure | undefined>;
    merge(ref: ChangeRequestRef, request: MergeRequest, signal: AbortSignal): Promise<ForgeActionFailure | undefined>;
    diff(ref: ChangeRequestRef, headSha: string, signal: AbortSignal, base?: string): Promise<string | ForgeFailure>;
    fileText(ref: ChangeRequestRef, commit: string, path: string, signal: AbortSignal): Promise<string | ForgeFailure>;
    fileUrl(ref: ChangeRequestRef, commit: string, path: string): string;
}
