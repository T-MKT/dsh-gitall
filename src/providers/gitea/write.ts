/** Changes Gitea pull requests through `gt`. */

import type { ChangeRequestRef, ForgeActionFailure, MergeRequest } from '@deepseek-ai/dsh-experimental-forge'
import type { CliOutput, CliRunner } from '../../core/cli.js'
import { actionFailureOf, failureOf } from '../../core/json.js'
import { checkedRepository, isCommit } from './urls.js'

/** Changes pull requests of the configured Gitea hosts. */
export class GiteaWriter {
  /**
   * @param run - runner for `gt`.
   * @param hosts - lowercase hosts this provider serves.
   */
  constructor(private readonly run: CliRunner, private readonly hosts: ReadonlySet<string>) {}

  /**
   * Report that Gitea has no draft pull requests, so there is nothing to mark ready.
   * @param ref - pull request that would be marked ready.
   * @param signal - unused; no request is made.
   * @returns always a `failed` failure explaining the platform limit.
   */
  markReady(ref: ChangeRequestRef, signal: AbortSignal): Promise<ForgeActionFailure | undefined> {
    void ref
    void signal
    return Promise.resolve({ code: 'failed', message: 'Gitea does not support draft pull requests' })
  }

  /**
   * Merge a pull request while its head is still `request.headSha`.
   * @param ref - pull request to merge.
   * @param request - merge method and the confirmed head commit.
   * @param signal - cancellation of the request.
   * @returns undefined once Gitea merged it, or why it did not.
   */
  async merge(ref: ChangeRequestRef, request: MergeRequest, signal: AbortSignal): Promise<ForgeActionFailure | undefined> {
    const repository = checkedRepository(ref)
    if (!isCommit(request.headSha)) throw new Error(`gitall: invalid head commit ${JSON.stringify(request.headSha)}`)
    if (!this.hosts.has(repository.host.toLowerCase())) {
      return { code: 'failed', message: `gitall: host ${JSON.stringify(repository.host)} is not configured for gitea` }
    }
    let output: CliOutput
    try {
      output = await this.run([
        'api', '-X', 'POST', `repos/${repository.owner}/${repository.name}/pulls/${ref.number}/merge`,
        '-f', `Do=${request.method}`, '-f', `head_commit_id=${request.headSha}`, '--host', repository.host, '--no-input',
      ], signal)
    } catch (error) {
      if (signal.aborted) throw signal.reason
      const failure = failureOf(error)
      return failure.code === 'unauthenticated'
        ? { code: 'unauthenticated', message: failure.message }
        : { code: 'failed', message: failure.message }
    }
    return output.exitCode === 0 ? undefined : actionFailureOf(output)
  }
}
