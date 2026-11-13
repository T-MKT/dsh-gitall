/** Gitee implementation of the forge provider contract. */

import type {
  ChangeRequestKey, ChangeRequestRef, ChangeRequestSnapshot, ForgeActionFailure, ForgeFailure, ForgeProvider, ForgeReadiness, ForgeRepository,
  MergeRequest,
} from '@deepseek-ai/dsh-experimental-forge'
import type { CliRunner } from '../../core/cli.js'
import type { ForgeSettings } from '../../config.js'
import { GiteeReader } from './read.js'
import { parsePullRequestUrl, parseRemoteUrl } from './urls.js'
import { GiteeWriter } from './write.js'

/** Gitee pull request provider reading through `gitee`. */
export class GiteeProvider implements ForgeProvider {
  readonly forge = 'gitee'
  private readonly hosts: ReadonlySet<string>
  private readonly reader: GiteeReader
  private readonly writer: GiteeWriter

  /**
   * @param run - runner for `gitee`.
   * @param settings - executable and served hosts.
   */
  constructor(run: CliRunner, settings: ForgeSettings) {
    this.hosts = new Set(settings.hosts.map(host => host.toLowerCase()))
    this.reader = new GiteeReader(run, this.hosts)
    this.writer = new GiteeWriter(run, this.hosts)
  }

  repositoryFromRemote(url: string): ForgeRepository | undefined {
    const location = parseRemoteUrl(url)
    if (location === undefined || !this.hosts.has(location.host)) return undefined
    return { forge: this.forge, host: location.host, owner: location.owner, name: location.name }
  }

  changeRequestFromUrl(url: string): ChangeRequestRef | undefined {
    const parsed = parsePullRequestUrl(url)
    if (parsed === undefined || !this.hosts.has(parsed.host)) return undefined
    return { repository: { forge: this.forge, host: parsed.host, owner: parsed.owner, name: parsed.name }, number: parsed.number }
  }

  changeRequestUrl(ref: ChangeRequestRef): string {
    const { host, owner, name } = ref.repository
    return `https://${host}/${owner}/${name}/pulls/${ref.number}`
  }

  async fetch(
    refs: readonly ChangeRequestRef[],
    signal: AbortSignal,
  ): Promise<ReadonlyMap<ChangeRequestKey, ChangeRequestSnapshot | ForgeFailure>> {
    return await this.reader.fetch(refs, signal)
  }

  async findByHead(repository: ForgeRepository, branch: string, signal: AbortSignal): Promise<readonly ChangeRequestRef[]> {
    return await this.reader.findByHead(repository, branch, signal)
  }

  async readiness(host: string, signal: AbortSignal): Promise<ForgeReadiness> {
    return await this.reader.readiness(host, signal)
  }

  async markReady(ref: ChangeRequestRef, signal: AbortSignal): Promise<ForgeActionFailure | undefined> {
    return await this.writer.markReady(ref, signal)
  }

  async merge(ref: ChangeRequestRef, request: MergeRequest, signal: AbortSignal): Promise<ForgeActionFailure | undefined> {
    return await this.writer.merge(ref, request, signal)
  }

  async diff(ref: ChangeRequestRef, headSha: string, signal: AbortSignal, base?: string): Promise<string | ForgeFailure> {
    // The recorded base commit cannot shorten this read: the files endpoint always names the pull request's own diff.
    void base
    return await this.reader.diff(ref, headSha, signal)
  }

  async fileText(ref: ChangeRequestRef, commit: string, path: string, signal: AbortSignal): Promise<string | ForgeFailure> {
    return await this.reader.fileText(ref, commit, path, signal)
  }

  fileUrl(ref: ChangeRequestRef, commit: string, path: string): string {
    const { host, owner, name } = ref.repository
    return `https://${host}/${owner}/${name}/blob/${commit}/${encodePath(path)}`
  }
}

function encodePath(path: string): string {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/')
}
