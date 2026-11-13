/** Changes GitLab merge requests through `glab`. */

import type { ForgeActionFailure, MergeRequest } from '@deepseek-ai/dsh-experimental-forge'
import type { ChangeRequestRef } from '@deepseek-ai/dsh-experimental-forge'
import type { CliOutput, CliRunner } from '../../core/cli.js'
import { actionFailureOf, failureOf } from '../../core/json.js'
import { checkedRepository, isCommit } from './urls.js'

/** Changes merge requests of the configured GitLab hosts. */
export class GitLabWriter {
  /**
   * @param run - runner for `glab`.
   * @param hosts - lowercase hosts this provider serves.
   */
  constructor(private readonly run: CliRunner, private readonly hosts: ReadonlySet<string>) {}

  /**
   * Mark a draft merge request ready for review.
   * @param ref - merge request to update.
   * @param signal - cancellation of the request.
   * @returns undefined once GitLab accepted it, or why it did not.
   */
  async markReady(ref: ChangeRequestRef, signal: AbortSignal): Promise<ForgeActionFailure | undefined> {
    const repository = checkedRepository(ref)
    return await this.act(repository.host, [
      'mr', 'update', String(ref.number), '--ready', '--yes', '-R', repositoryUrl(repository),
    ], signal)
  }

  /**
   * Merge a merge request while its head is still `request.headSha`.
   * @param ref - merge request to merge.
   * @param request - merge method and the confirmed head commit.
   * @param signal - cancellation of the request.
   * @returns undefined once GitLab merged it, or why it did not.
   */
  async merge(ref: ChangeRequestRef, request: MergeRequest, signal: AbortSignal): Promise<ForgeActionFailure | undefined> {
    const repository = checkedRepository(ref)
    if (!isCommit(request.headSha)) throw new Error(`gitall: invalid head commit ${JSON.stringify(request.headSha)}`)
    const args = ['mr', 'merge', String(ref.number), '--yes', '--auto-merge=false', '-R', repositoryUrl(repository), '--sha', request.headSha]
    if (request.method === 'squash') args.push('--squash')
    else if (request.method === 'rebase') args.push('--rebase')
    return await this.act(repository.host, args, signal)
  }

  /** Run one changing `glab` command; a refusal becomes an action failure. */
  private async act(host: string, args: readonly string[], signal: AbortSignal): Promise<ForgeActionFailure | undefined> {
    if (!this.hosts.has(host.toLowerCase())) return { code: 'failed', message: `gitall: host ${JSON.stringify(host)} is not configured for gitlab` }
    let output: CliOutput
    try {
      output = await this.run(args, signal)
    } catch (error) {
      if (signal.aborted) throw signal.reason
      return writeFailureOf(error)
    }
    return output.exitCode === 0 ? undefined : actionFailureOf(output)
  }
}

function writeFailureOf(error: unknown): ForgeActionFailure {
  const failure = failureOf(error)
  return failure.code === 'unauthenticated'
    ? { code: 'unauthenticated', message: failure.message }
    : { code: 'failed', message: failure.message }
}

function repositoryUrl(repository: { readonly host: string; readonly owner: string; readonly name: string }): string {
  return `https://${repository.host}/${repository.owner}/${repository.name}`
}
