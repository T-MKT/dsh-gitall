/** Reads Gitee pull requests through `gitee api`. */

import { changeRequestKey } from '@deepseek-ai/dsh-experimental-forge'
import type {
  ChangeRequestKey, ChangeRequestRef, ChangeRequestSnapshot, ForgeFailure, ForgeReadiness, ForgeRepository,
} from '@deepseek-ai/dsh-experimental-forge'
import type { CliOutput, CliRunner } from '../../core/cli.js'
import { asRecord, failureOf, firstLine, isFailure, parseJson, refusalOf, text } from '../../core/json.js'
import { unifiedPatch } from '../../core/patch.js'
import { snapshotOf } from '../../core/snapshot.js'
import { checkedRepository, isCommit } from './urls.js'

/** Reads pull requests of the configured Gitee hosts. */
export class GiteeReader {
  /**
   * @param run - runner for `gitee`.
   * @param hosts - lowercase hosts this provider serves.
   */
  constructor(private readonly run: CliRunner, private readonly hosts: ReadonlySet<string>) {}

  /**
   * Read the status of several pull requests.
   * @param refs - pull requests to read.
   * @param signal - cancellation of the read.
   * @returns one result per requested pull request.
   */
  async fetch(
    refs: readonly ChangeRequestRef[],
    signal: AbortSignal,
  ): Promise<ReadonlyMap<ChangeRequestKey, ChangeRequestSnapshot | ForgeFailure>> {
    const results = new Map<ChangeRequestKey, ChangeRequestSnapshot | ForgeFailure>()
    for (const ref of refs) {
      results.set(changeRequestKey(ref), await this.fetchOne(ref, signal))
    }
    return results
  }

  /**
   * Find open pull requests whose head is `branch`.
   * @param repository - repository to search.
   * @param branch - head branch name.
   * @param signal - cancellation of the read.
   * @returns matching pull requests, newest first.
   * @throws when the host is not configured or Gitee refuses the read.
   */
  async findByHead(repository: ForgeRepository, branch: string, signal: AbortSignal): Promise<readonly ChangeRequestRef[]> {
    this.checkedHost(repository.host)
    const head = encodeURIComponent(`${repository.owner}:${branch}`)
    const output = await this.execute([
      'api', `/repos/${repository.owner}/${repository.name}/pulls?state=open&head=${head}&per_page=100`,
      '--hostname', repository.host, '--no-tui',
    ], signal)
    if (typeof output !== 'string') throw new Error(output.message)
    const entries = parseJson(output)
    if (!Array.isArray(entries)) throw new Error('gitall: unexpected Gitee response to the pull request lookup')
    return entries.flatMap(entry => {
      const record = asRecord(entry)
      const headRef = asRecord(record?.head)
      if (headRef === undefined || text(headRef.ref) !== branch) return []
      if (!sameRepositoryLabel(headRef, asRecord(record?.base))) return []
      const number = typeof record?.number === 'number' ? record.number : Number(record?.number)
      return Number.isSafeInteger(number) && number > 0 ? [{ repository, number }] : []
    })
  }

  /**
   * Read the changes of a pull request at `headSha`.
   * @param ref - pull request to read.
   * @param headSha - head commit the patch must describe.
   * @param signal - cancellation of the read.
   * @returns the patch, or why Gitee did not provide it at `headSha`.
   */
  async diff(ref: ChangeRequestRef, headSha: string, signal: AbortSignal): Promise<string | ForgeFailure> {
    const { host } = checkedRepository(ref)
    this.checkedHost(host)
    if (!isCommit(headSha)) throw new Error(`gitall: invalid head commit ${JSON.stringify(headSha)}`)
    const current = await this.readPullRequest(ref, signal)
    if (isFailure(current)) return current
    const head = text(asRecord(current.head)?.sha) ?? ''
    if (head.toLowerCase() !== headSha.toLowerCase()) {
      return { code: 'stale', message: `the pull request head moved from ${headSha} to ${head}` }
    }
    const files = await this.readFiles(ref, signal)
    if (isFailure(files)) return files
    if (files.some(file => file.tooLarge)) return { code: 'too-large', message: 'Gitee omitted a large file diff' }
    return unifiedPatch(files.map(file => file.patch))
  }

  /**
   * Read one file at a commit through the contents endpoint.
   * @param ref - pull request whose repository is read.
   * @param commit - commit object name.
   * @param path - path relative to the repository root.
   * @param signal - cancellation of the read.
   * @returns the decoded file text, or why Gitee did not provide it.
   */
  async fileText(ref: ChangeRequestRef, commit: string, path: string, signal: AbortSignal): Promise<string | ForgeFailure> {
    const { host } = checkedRepository(ref)
    this.checkedHost(host)
    if (!isCommit(commit)) throw new Error(`gitall: invalid commit ${JSON.stringify(commit)}`)
    const output = await this.execute([
      'api', `/repos/${ref.repository.owner}/${ref.repository.name}/contents/${encodePath(path)}?ref=${commit}`,
      '--hostname', host, '--no-tui',
    ], signal)
    if (typeof output !== 'string') return output
    const body = asRecord(parseJson(output))
    if (body === undefined || text(body.type) !== 'file' || text(body.content) === undefined) {
      return { code: 'not-found', message: `Gitee returned no file at ${path}` }
    }
    return Buffer.from(text(body.content) ?? '', 'base64').toString('utf8')
  }

  /**
   * Report whether `gitee` is signed in to a host.
   * @param host - Gitee host to probe.
   * @param signal - cancellation of the probe.
   * @returns readiness for that host.
   */
  async readiness(host: string, signal: AbortSignal): Promise<ForgeReadiness> {
    if (!this.hosts.has(host.toLowerCase())) return { state: 'unavailable', message: notConfigured(host) }
    let output: CliOutput
    try {
      output = await this.run(['auth', 'status', '--json', '--hostname', host, '--no-tui'], signal)
    } catch (error) {
      if (signal.aborted) throw signal.reason
      if (error instanceof Error) return { state: 'unavailable', message: error.message }
      throw error
    }
    const status = asRecord(parseJson(output.stdout))
    if (status === undefined) return { state: 'unavailable', message: firstLine(output.stderr) ?? 'unexpected Gitee response to the auth probe' }
    if (text(status.status) === 'logged in') return { state: 'ready', message: null }
    return { state: 'unauthenticated', message: `gitee is not signed in to ${host}; run: gitee auth login` }
  }

  private async fetchOne(ref: ChangeRequestRef, signal: AbortSignal): Promise<ChangeRequestSnapshot | ForgeFailure> {
    const { host } = checkedRepository(ref)
    if (!this.hosts.has(host.toLowerCase())) return { code: 'unavailable', message: notConfigured(host) }
    const current = await this.readPullRequest(ref, signal)
    if (isFailure(current)) return current
    const files = await this.readFiles(ref, signal)
    const stats = isFailure(files) ? { additions: 0, deletions: 0 } : countLines(files)
    const head = asRecord(current.head)
    const base = asRecord(current.base)
    const state = text(current.state) ?? 'open'
    const merged = text(current.merged_at) !== undefined || state === 'merged'
    const lifecycle = merged ? 'merged' : state === 'closed' ? 'closed' : 'open'
    const draft = current.draft === true || /^\s*(?:WIP|\[WIP\]|Draft)/i.test(text(current.title) ?? '')
    const mergeability = current.mergeable === true ? 'mergeable' : current.mergeable === false ? 'conflicting' : 'unknown'
    const baseSha = text(base?.sha)
    return snapshotOf(ref, {
      url: text(current.html_url) ?? `https://${host}/${ref.repository.owner}/${ref.repository.name}/pulls/${ref.number}`,
      title: text(current.title) ?? '',
      state: lifecycle,
      draft,
      author: text(asRecord(current.user)?.login) ?? null,
      headBranch: text(head?.ref) ?? '',
      headSha: text(head?.sha) ?? '',
      baseBranch: text(base?.ref) ?? '',
      ...baseSha === undefined ? {} : { baseSha },
      additions: stats.additions,
      deletions: stats.deletions,
      mergeability,
      mergeReady: lifecycle === 'open' && !draft && current.mergeable === true,
      mergeMethods: ['merge', 'squash'],
      checks: [],
      updatedAt: text(current.updated_at) ?? '',
      closedAt: merged ? text(current.merged_at) ?? text(current.closed_at) ?? null : text(current.closed_at) ?? null,
    })
  }

  private async readPullRequest(ref: ChangeRequestRef, signal: AbortSignal): Promise<Record<string, unknown> | ForgeFailure> {
    const output = await this.execute([
      'api', `/repos/${ref.repository.owner}/${ref.repository.name}/pulls/${ref.number}`, '--hostname', ref.repository.host, '--no-tui',
    ], signal)
    if (typeof output !== 'string') return output
    const body = asRecord(parseJson(output))
    return body ?? { code: 'unavailable', message: 'unexpected Gitee response to the pull request read' }
  }

  private async readFiles(ref: ChangeRequestRef, signal: AbortSignal): Promise<readonly GiteeFile[] | ForgeFailure> {
    const output = await this.execute([
      'api', `/repos/${ref.repository.owner}/${ref.repository.name}/pulls/${ref.number}/files`,
      '--hostname', ref.repository.host, '--no-tui',
    ], signal)
    if (typeof output !== 'string') return output
    const entries = parseJson(output)
    if (!Array.isArray(entries)) return { code: 'unavailable', message: 'unexpected Gitee response to the file read' }
    return entries.map(entry => giteeFileOf(entry))
  }

  /** Run one reading `gitee` command, returning its stdout or why it failed. */
  private async execute(args: readonly string[], signal: AbortSignal): Promise<string | ForgeFailure> {
    let output: CliOutput
    try {
      output = await this.run(args, signal)
    } catch (error) {
      if (signal.aborted) throw signal.reason
      return failureOf(error)
    }
    return output.exitCode === 0 ? output.stdout : refusalOf(output)
  }

  private checkedHost(host: string): void {
    if (!this.hosts.has(host.toLowerCase())) throw new Error(notConfigured(host))
  }
}

/** One entry of the pull request files endpoint. */
interface GiteeFile {
  readonly patch: { readonly oldPath: string; readonly newPath: string; readonly body: string; readonly newFile?: boolean; readonly deletedFile?: boolean }
  readonly additions: number
  readonly deletions: number
  readonly tooLarge: boolean
}

function giteeFileOf(entry: unknown): GiteeFile {
  const record = asRecord(entry)
  const patch = asRecord(record?.patch)
  const filename = text(record?.filename) ?? text(patch?.new_path) ?? ''
  return {
    patch: {
      oldPath: text(patch?.old_path) ?? filename,
      newPath: text(patch?.new_path) ?? filename,
      body: text(patch?.diff) ?? '',
      newFile: patch?.new_file === true,
      deletedFile: patch?.deleted_file === true,
    },
    additions: countNumber(record?.additions),
    deletions: countNumber(record?.deletions),
    tooLarge: patch?.too_large === true,
  }
}

function countNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : 0
}

function countLines(files: readonly GiteeFile[]): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const file of files) {
    additions += file.additions
    deletions += file.deletions
  }
  return { additions, deletions }
}

/** Whether a head and base branch label name the same repository. */
function sameRepositoryLabel(head: Record<string, unknown> | undefined, base: Record<string, unknown> | undefined): boolean {
  const headLabel = text(head?.label) ?? ''
  const baseLabel = text(base?.label) ?? ''
  if (!headLabel.includes(':') || !baseLabel.includes(':')) return true
  return headLabel.slice(0, headLabel.lastIndexOf(':')).toLowerCase() === baseLabel.slice(0, baseLabel.lastIndexOf(':')).toLowerCase()
}

function encodePath(path: string): string {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function notConfigured(host: string): string {
  return `gitall: host ${JSON.stringify(host)} is not configured for gitee`
}
