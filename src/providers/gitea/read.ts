/** Reads Gitea pull requests through `gt api`. */

import { changeRequestKey } from '@deepseek-ai/dsh-experimental-forge'
import type {
  ChangeRequestCheck, ChangeRequestKey, ChangeRequestRef, ChangeRequestSnapshot, ForgeFailure, ForgeReadiness, ForgeRepository,
} from '@deepseek-ai/dsh-experimental-forge'
import type { CliOutput, CliRunner } from '../../core/cli.js'
import { asRecord, failureOf, firstLine, isFailure, parseJson, refusalOf, text } from '../../core/json.js'
import { snapshotOf } from '../../core/snapshot.js'
import { checkedRepository, isCommit } from './urls.js'

/** Check statuses Gitea reports for a commit. */
const CHECK_STATE: Readonly<Record<string, ChangeRequestCheck['state']>> = {
  pending: 'pending',
  success: 'success',
  error: 'failure',
  failure: 'failure',
  warning: 'neutral',
  skipped: 'skipped',
}

/** Reads pull requests of the configured Gitea hosts. */
export class GiteaReader {
  /**
   * @param run - runner for `gt`.
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
   * @throws when the host is not configured or Gitea refuses the read.
   */
  async findByHead(repository: ForgeRepository, branch: string, signal: AbortSignal): Promise<readonly ChangeRequestRef[]> {
    this.checkedHost(repository.host)
    const output = await this.execute([
      'api', `repos/${repository.owner}/${repository.name}/pulls?state=open&limit=50`, '--host', repository.host, '--no-input',
    ], signal)
    if (typeof output !== 'string') throw new Error(output.message)
    const entries = parseJson(output)
    if (!Array.isArray(entries)) throw new Error('gitall: unexpected Gitea response to the pull request lookup')
    return entries.flatMap(entry => {
      const record = asRecord(entry)
      const head = asRecord(record?.head)
      const base = asRecord(record?.base)
      if (head === undefined || text(head.ref) !== branch) return []
      if (typeof head.repo_id === 'number' && typeof base?.repo_id === 'number' && head.repo_id !== base.repo_id) return []
      const number = typeof record?.number === 'number' ? record.number : Number(record?.number)
      return Number.isSafeInteger(number) && number > 0 ? [{ repository, number }] : []
    })
  }

  /**
   * Read the changes of a pull request at `headSha`.
   * @param ref - pull request to read.
   * @param headSha - head commit the patch must describe.
   * @param signal - cancellation of the read.
   * @returns the patch, or why Gitea did not provide it at `headSha`.
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
    const patch = await this.execute([
      'api', `repos/${ref.repository.owner}/${ref.repository.name}/pulls/${ref.number}.diff`, '--host', host, '--no-input',
    ], signal)
    if (typeof patch !== 'string') return patch
    return patch.trim().length === 0 ? { code: 'unavailable', message: 'Gitea returned an empty diff' } : patch
  }

  /**
   * Read one file at a commit through the raw file endpoint.
   * @param ref - pull request whose repository is read.
   * @param commit - commit object name.
   * @param path - path relative to the repository root.
   * @param signal - cancellation of the read.
   * @returns the file text, or why Gitea did not provide it.
   */
  async fileText(ref: ChangeRequestRef, commit: string, path: string, signal: AbortSignal): Promise<string | ForgeFailure> {
    const { host } = checkedRepository(ref)
    this.checkedHost(host)
    if (!isCommit(commit)) throw new Error(`gitall: invalid commit ${JSON.stringify(commit)}`)
    return await this.execute([
      'api', `repos/${ref.repository.owner}/${ref.repository.name}/raw/${encodePath(path)}?ref=${commit}`, '--host', host, '--no-input',
    ], signal)
  }

  /**
   * Report whether `gt` has a usable account for a host.
   * @param host - Gitea host to probe.
   * @param signal - cancellation of the probe.
   * @returns readiness for that host.
   */
  async readiness(host: string, signal: AbortSignal): Promise<ForgeReadiness> {
    if (!this.hosts.has(host.toLowerCase())) return { state: 'unavailable', message: notConfigured(host) }
    let output: CliOutput
    try {
      output = await this.run(['auth', 'status', '--host', host], signal)
    } catch (error) {
      if (signal.aborted) throw signal.reason
      if (error instanceof Error) return { state: 'unavailable', message: error.message }
      throw error
    }
    if (output.exitCode === 0) return { state: 'ready', message: null }
    const message = firstLine(output.stderr) ?? firstLine(output.stdout) ?? `gt is not signed in to ${host}`
    return { state: output.exitCode === 4 ? 'unauthenticated' : 'unavailable', message }
  }

  private async fetchOne(ref: ChangeRequestRef, signal: AbortSignal): Promise<ChangeRequestSnapshot | ForgeFailure> {
    const { host } = checkedRepository(ref)
    if (!this.hosts.has(host.toLowerCase())) return { code: 'unavailable', message: notConfigured(host) }
    const current = await this.readPullRequest(ref, signal)
    if (isFailure(current)) return current
    const head = asRecord(current.head)
    const base = asRecord(current.base)
    const headSha = text(head?.sha) ?? ''
    const baseSha = text(base?.sha)
    const state = text(current.state) ?? 'open'
    const merged = current.merged === true || text(current.merged_at) !== undefined
    const lifecycle = merged ? 'merged' : state === 'closed' ? 'closed' : 'open'
    const draft = current.draft === true || /^\s*(?:WIP|\[WIP\])/i.test(text(current.title) ?? '')
    const mergeability = current.mergeable === true ? 'mergeable' : current.mergeable === false ? 'conflicting' : 'unknown'
    return snapshotOf(ref, {
      url: text(current.html_url) ?? `https://${host}/${ref.repository.owner}/${ref.repository.name}/pulls/${ref.number}`,
      title: text(current.title) ?? '',
      state: lifecycle,
      draft,
      author: text(asRecord(current.user)?.login) ?? null,
      headBranch: text(head?.ref) ?? '',
      headSha,
      baseBranch: text(base?.ref) ?? '',
      ...baseSha === undefined ? {} : { baseSha },
      additions: numberOr(current.additions, 0),
      deletions: numberOr(current.deletions, 0),
      mergeability,
      mergeReady: lifecycle === 'open' && !draft && current.mergeable === true,
      mergeMethods: ['merge', 'squash', 'rebase'],
      checks: await this.checksOf(ref, headSha, signal),
      updatedAt: text(current.updated_at) ?? '',
      closedAt: merged ? text(current.merged_at) ?? text(current.closed_at) ?? null : text(current.closed_at) ?? null,
    })
  }

  private async readPullRequest(ref: ChangeRequestRef, signal: AbortSignal): Promise<Record<string, unknown> | ForgeFailure> {
    const output = await this.execute([
      'api', `repos/${ref.repository.owner}/${ref.repository.name}/pulls/${ref.number}`, '--host', ref.repository.host, '--no-input',
    ], signal)
    if (typeof output !== 'string') return output
    const body = asRecord(parseJson(output))
    return body ?? { code: 'unavailable', message: 'unexpected Gitea response to the pull request read' }
  }

  /** Read the head commit's statuses; a failed read leaves the snapshot without checks. */
  private async checksOf(ref: ChangeRequestRef, headSha: string, signal: AbortSignal): Promise<readonly ChangeRequestCheck[]> {
    if (headSha.length === 0) return []
    const output = await this.execute([
      'api', `repos/${ref.repository.owner}/${ref.repository.name}/commits/${headSha}/statuses`, '--host', ref.repository.host, '--no-input',
    ], signal)
    if (typeof output !== 'string') return []
    const entries = parseJson(output)
    if (!Array.isArray(entries)) return []
    return entries.flatMap(entry => {
      const record = asRecord(entry)
      if (record === undefined) return []
      const status = text(record.status) ?? ''
      return [{
        name: text(record.context) ?? text(record.description) ?? 'status',
        state: CHECK_STATE[status] ?? 'neutral',
        url: text(record.target_url) ?? null,
        workflow: null,
        startedAt: text(record.created_at) ?? null,
        completedAt: text(record.updated_at) ?? null,
        rerun: null,
      }]
    })
  }

  /** Run one reading `gt` command, returning its stdout or why it failed. */
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

function numberOr(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback
}

function encodePath(path: string): string {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function notConfigured(host: string): string {
  return `gitall: host ${JSON.stringify(host)} is not configured for gitea`
}
