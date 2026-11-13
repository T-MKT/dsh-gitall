/** Reads GitLab merge requests through `glab api`. */

import { changeRequestKey } from '@deepseek-ai/dsh-experimental-forge'
import type {
  ChangeRequestCheck, ChangeRequestKey, ChangeRequestRef, ChangeRequestSnapshot, ForgeFailure, ForgeReadiness, ForgeRepository,
} from '@deepseek-ai/dsh-experimental-forge'
import { asRecord, failureOf, firstLine, parseJson, refusalOf, text } from '../../core/json.js'
import type { CliOutput, CliRunner } from '../../core/cli.js'
import type { FileDiff } from '../../core/patch.js'
import { unifiedPatch } from '../../core/patch.js'
import { snapshotOf } from '../../core/snapshot.js'
import { checkedRepository, isCommit } from './urls.js'

/** Check statuses GitLab reports for a pipeline. */
const CHECK_STATE: Readonly<Record<string, ChangeRequestCheck['state']>> = {
  success: 'success',
  failed: 'failure',
  canceled: 'cancelled',
  cancelling: 'cancelled',
  skipped: 'skipped',
  manual: 'neutral',
  created: 'pending',
  waiting_for_resource: 'pending',
  preparing: 'pending',
  pending: 'pending',
  running: 'pending',
  scheduled: 'pending',
}

/** One merge request as GitLab reports it, narrowed to the fields these reads use. */
interface MergeRequestJson {
  readonly web_url?: unknown
  readonly title?: unknown
  readonly state?: unknown
  readonly draft?: unknown
  readonly work_in_progress?: unknown
  readonly merged_at?: unknown
  readonly closed_at?: unknown
  readonly updated_at?: unknown
  readonly source_branch?: unknown
  readonly target_branch?: unknown
  readonly sha?: unknown
  readonly author?: unknown
  readonly user?: unknown
  readonly head_pipeline?: unknown
  readonly pipeline?: unknown
  readonly merge_status?: unknown
  readonly detailed_merge_status?: unknown
  readonly has_conflicts?: unknown
  readonly diff_refs?: unknown
  readonly source_project_id?: unknown
  readonly target_project_id?: unknown
  readonly iid?: unknown
}

/** Reads merge requests of the configured GitLab hosts. */
export class GitLabReader {
  /**
   * @param run - runner for `glab`.
   * @param hosts - lowercase hosts this provider serves.
   */
  constructor(private readonly run: CliRunner, private readonly hosts: ReadonlySet<string>) {}

  /**
   * Read the status of several merge requests.
   * @param refs - merge requests to read.
   * @param signal - cancellation of the read.
   * @returns one result per requested merge request.
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
   * Find open merge requests whose source is `branch`.
   * @param repository - repository to search.
   * @param branch - source branch name.
   * @param signal - cancellation of the read.
   * @returns matching merge requests, newest first.
   * @throws when the host is not configured or GitLab refuses the read.
   */
  async findByHead(repository: ForgeRepository, branch: string, signal: AbortSignal): Promise<readonly ChangeRequestRef[]> {
    this.checkedHost(repository.host)
    const query = `merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}&per_page=100`
    const output = await this.execute(['api', '--hostname', repository.host, 'projects', projectPath(repository), query], signal)
    if (typeof output !== 'string') throw new Error(output.message)
    const entries = parseJson(output)
    if (!Array.isArray(entries)) throw new Error('gitall: unexpected GitLab response to the merge request lookup')
    return entries.flatMap(entry => {
      const record = entry as MergeRequestJson
      const number = typeof record.iid === 'number' ? record.iid : Number(record.iid)
      if (!Number.isSafeInteger(number) || number <= 0) return []
      if (record.source_project_id !== record.target_project_id) return []
      return [{ repository, number }]
    })
  }

  /**
   * Read the changes of a merge request at `headSha`.
   * @param ref - merge request to read.
   * @param headSha - head commit the patch must describe.
   * @param signal - cancellation of the read.
   * @returns the patch, or why GitLab did not provide it at `headSha`.
   */
  async diff(ref: ChangeRequestRef, headSha: string, signal: AbortSignal): Promise<string | ForgeFailure> {
    const { host } = checkedRepository(ref)
    this.checkedHost(host)
    if (!isCommit(headSha)) throw new Error(`gitall: invalid head commit ${JSON.stringify(headSha)}`)
    const current = await this.readMergeRequest(ref, signal)
    if ('code' in current) return current
    const head = text(current.sha) ?? ''
    if (head.toLowerCase() !== headSha.toLowerCase()) {
      return { code: 'stale', message: `the merge request head moved from ${headSha} to ${head}` }
    }
    const files = await this.readDiffs(ref, signal)
    if ('code' in files) return files
    if (files.some(file => file.tooLarge)) return { code: 'too-large', message: 'GitLab omitted a large file diff' }
    return unifiedPatch(files.map(file => file.patch))
  }

  /**
   * Read one file at a commit through the raw file endpoint.
   * @param ref - merge request whose repository is read.
   * @param commit - commit object name.
   * @param path - path relative to the repository root.
   * @param signal - cancellation of the read.
   * @returns the file text, or why GitLab did not provide it.
   */
  async fileText(ref: ChangeRequestRef, commit: string, path: string, signal: AbortSignal): Promise<string | ForgeFailure> {
    const { host } = checkedRepository(ref)
    this.checkedHost(host)
    if (!isCommit(commit)) throw new Error(`gitall: invalid commit ${JSON.stringify(commit)}`)
    return await this.execute([
      'api', '--hostname', host, 'projects', projectPath(ref.repository), 'repository/files', encodeURIComponent(path), `raw?ref=${commit}`,
    ], signal)
  }

  /**
   * Report whether `glab` is signed in to a host.
   * @param host - GitLab host to probe.
   * @param signal - cancellation of the probe.
   * @returns readiness for that host.
   */
  async readiness(host: string, signal: AbortSignal): Promise<ForgeReadiness> {
    if (!this.hosts.has(host.toLowerCase())) return { state: 'unavailable', message: notConfigured(host) }
    let output: CliOutput
    try {
      output = await this.run(['auth', 'status', '--hostname', host], signal)
    } catch (error) {
      if (signal.aborted) throw signal.reason
      if (error instanceof Error) return { state: 'unavailable', message: error.message }
      throw error
    }
    if (output.exitCode === 0) return { state: 'ready', message: null }
    return { state: 'unauthenticated', message: firstLine(output.stderr) ?? firstLine(output.stdout) ?? `glab is not signed in to ${host}` }
  }

  private async fetchOne(ref: ChangeRequestRef, signal: AbortSignal): Promise<ChangeRequestSnapshot | ForgeFailure> {
    const { host } = checkedRepository(ref)
    if (!this.hosts.has(host.toLowerCase())) return { code: 'unavailable', message: notConfigured(host) }
    const current = await this.readMergeRequest(ref, signal)
    if ('code' in current) return current
    const files = await this.readDiffs(ref, signal)
    const stats = 'code' in files ? { additions: 0, deletions: 0 } : countLines(files)
    const headSha = text(current.sha) ?? text(asRecordField(current.diff_refs, 'head_sha')) ?? ''
    const baseSha = text(asRecordField(current.diff_refs, 'base_sha'))
    const state = text(current.state) ?? 'opened'
    const merged = text(current.merged_at) !== undefined || state === 'merged'
    const lifecycle = merged ? 'merged' : state === 'closed' || state === 'locked' ? 'closed' : 'open'
    const draft = current.draft === true || current.work_in_progress === true
    const mergeability = current.has_conflicts === true ? 'conflicting'
      : current.merge_status === 'can_be_merged' || current.detailed_merge_status === 'mergeable' ? 'mergeable'
        : 'unknown'
    const mergeReady = lifecycle === 'open' && !draft && mergeability === 'mergeable'
      && asRecordField(current.user, 'can_merge') === true
    return snapshotOf(ref, {
      url: text(current.web_url) ?? `https://${host}/${ref.repository.owner}/${ref.repository.name}/-/merge_requests/${ref.number}`,
      title: text(current.title) ?? '',
      state: lifecycle,
      draft,
      author: text(asRecordField(current.author, 'username')) ?? null,
      headBranch: text(current.source_branch) ?? '',
      headSha,
      baseBranch: text(current.target_branch) ?? '',
      ...baseSha === undefined ? {} : { baseSha },
      additions: stats.additions,
      deletions: stats.deletions,
      mergeability,
      mergeReady,
      mergeMethods: ['merge', 'squash', 'rebase'],
      checks: checksOf(current),
      updatedAt: text(current.updated_at) ?? '',
      closedAt: merged ? text(current.merged_at) ?? text(current.closed_at) ?? null : text(current.closed_at) ?? null,
    })
  }

  private async readMergeRequest(ref: ChangeRequestRef, signal: AbortSignal): Promise<MergeRequestJson | ForgeFailure> {
    const output = await this.execute([
      'api', '--hostname', ref.repository.host, 'projects', projectPath(ref.repository), 'merge_requests', String(ref.number),
    ], signal)
    if (typeof output !== 'string') return output
    const body = parseJson(output)
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? body as MergeRequestJson
      : { code: 'unavailable', message: 'unexpected GitLab response to the merge request read' }
  }

  private async readDiffs(ref: ChangeRequestRef, signal: AbortSignal): Promise<readonly DiffFile[] | ForgeFailure> {
    const files: DiffFile[] = []
    for (let page = 1; page <= 10; page += 1) {
      const output = await this.execute([
        'api', '--hostname', ref.repository.host, 'projects', projectPath(ref.repository), 'merge_requests', String(ref.number),
        `diffs?per_page=100&page=${page}`,
      ], signal)
      if (typeof output !== 'string') return output
      const entries = parseJson(output)
      if (!Array.isArray(entries)) return { code: 'unavailable', message: 'unexpected GitLab response to the diff read' }
      for (const entry of entries) files.push(diffFileOf(entry))
      if (entries.length < 100) break
      if (page === 10) return { code: 'too-large', message: 'the merge request has more than 1000 changed files' }
    }
    return files
  }

  /** Run one reading `glab` command, returning its stdout or why it failed. */
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

/** One entry of the merge request diffs endpoint. */
interface DiffFile {
  readonly patch: FileDiff
  readonly tooLarge: boolean
}

function diffFileOf(entry: unknown): DiffFile {
  const record = asRecord(entry)
  const oldPath = text(record?.old_path) ?? text(record?.new_path) ?? ''
  const newPath = text(record?.new_path) ?? oldPath
  return {
    patch: {
      oldPath,
      newPath,
      body: text(record?.diff) ?? '',
      newFile: record?.new_file === true,
      deletedFile: record?.deleted_file === true,
    },
    tooLarge: record?.too_large === true,
  }
}

function countLines(files: readonly DiffFile[]): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const file of files) {
    for (const line of file.patch.body.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions += 1
      else if (line.startsWith('-') && !line.startsWith('---')) deletions += 1
    }
  }
  return { additions, deletions }
}

function checksOf(current: MergeRequestJson): readonly ChangeRequestCheck[] {
  const pipeline = asRecord(current.head_pipeline) ?? asRecord(current.pipeline)
  if (pipeline === undefined) return []
  const status = text(pipeline.status) ?? ''
  const id = text(pipeline.id) ?? ''
  return [{
    name: text(pipeline.name) ?? (id.length > 0 ? `pipeline #${id}` : 'pipeline'),
    state: CHECK_STATE[status] ?? 'neutral',
    url: text(pipeline.web_url) ?? null,
    workflow: null,
    startedAt: text(pipeline.created_at) ?? null,
    completedAt: text(pipeline.finished_at) ?? null,
    rerun: null,
  }]
}

function asRecordField(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined
}

function projectPath(repository: ForgeRepository): string {
  return encodeURIComponent(`${repository.owner}/${repository.name}`)
}

function notConfigured(host: string): string {
  return `gitall: host ${JSON.stringify(host)} is not configured for gitlab`
}
