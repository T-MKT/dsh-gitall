import { describe, expect, it } from 'vitest'
import { changeRequestKey } from '@deepseek-ai/dsh-experimental-forge'
import type { ChangeRequestRef } from '@deepseek-ai/dsh-experimental-forge'
import { CliUnavailableError } from '../../src/core/cli.js'
import type { CliOutput, CliRunner } from '../../src/core/cli.js'
import { GiteaProvider } from '../../src/providers/gitea/provider.js'
import { parsePullRequestUrl, parseRemoteUrl } from '../../src/providers/gitea/urls.js'

const HEAD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)
const MOVED = 'c'.repeat(40)
const DIFF = 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n'

const provider = (run: CliRunner): GiteaProvider => new GiteaProvider(run, { command: 'gt', hosts: ['gitea.example.org'] })

const ref: ChangeRequestRef = {
  repository: { forge: 'gitea', host: 'gitea.example.org', owner: 'owner', name: 'repo' },
  number: 3,
}
const KEY = changeRequestKey(ref)

const pullRequest = (override: Record<string, unknown> = {}): string => JSON.stringify({
  number: 3,
  title: 'Add a thing',
  state: 'open',
  draft: false,
  merged: false,
  merged_at: null,
  closed_at: null,
  mergeable: true,
  additions: 4,
  deletions: 2,
  updated_at: '2026-11-13T00:00:00Z',
  user: { login: 'tak' },
  head: { ref: 'feature/thing', sha: HEAD, repo_id: 1 },
  base: { ref: 'main', sha: BASE, repo_id: 1 },
  html_url: 'https://gitea.example.org/owner/repo/pulls/3',
  ...override,
})

const statuses = JSON.stringify([{
  status: 'success',
  context: 'ci/build',
  target_url: 'https://gitea.example.org/owner/repo/actions/runs/1',
  created_at: '2026-11-12T00:00:00Z',
  updated_at: '2026-11-12T00:10:00Z',
}])

interface Recorder {
  readonly run: CliRunner
  readonly calls: string[][]
}

function recorder(handler: (args: readonly string[]) => CliOutput): Recorder {
  const calls: string[][] = []
  const run: CliRunner = async (args, signal) => {
    signal.throwIfAborted()
    calls.push([...args])
    return handler(args)
  }
  return { run, calls }
}

const ok = (stdout: string): CliOutput => ({ exitCode: 0, stdout, stderr: '' })

function dispatch(args: readonly string[], overrides: Record<string, CliOutput> = {}): CliOutput {
  const joined = args.join(' ')
  for (const [needle, output] of Object.entries(overrides)) {
    if (joined.includes(needle)) return output
  }
  if (args[0] === 'auth') return ok('gitea.example.org: tak')
  if (joined.includes('pulls/3.diff')) return ok(DIFF)
  if (joined.includes('/statuses')) return ok(statuses)
  if (joined.includes('pulls?state=open')) return ok(JSON.stringify([{ number: 3, head: { ref: 'feature/thing', repo_id: 1 }, base: { repo_id: 1 } }]))
  if (joined.includes('pulls/3')) return ok(pullRequest())
  if (joined.includes('/raw/')) return ok('file contents')
  return { exitCode: 1, stdout: '', stderr: `unexpected command: ${joined}` }
}

describe('Gitea URLs', () => {
  it('parses remotes and pull request URLs', () => {
    expect(parseRemoteUrl('https://gitea.example.org/owner/repo.git')).toEqual({ host: 'gitea.example.org', owner: 'owner', name: 'repo' })
    expect(parseRemoteUrl('git@gitea.example.org:owner/repo.git')).toEqual({ host: 'gitea.example.org', owner: 'owner', name: 'repo' })
    expect(parseRemoteUrl('ssh://git@gitea.example.org:2222/owner/repo')).toEqual({ host: 'gitea.example.org', owner: 'owner', name: 'repo' })
    expect(parseRemoteUrl('https://gitea.example.org/owner/repo/extra')).toBeUndefined()
    expect(parsePullRequestUrl('https://gitea.example.org/owner/repo/pulls/3/files')).toEqual({
      host: 'gitea.example.org', owner: 'owner', name: 'repo', number: 3,
    })
    expect(parsePullRequestUrl('https://gitea.example.org/owner/repo/issues/3')).toBeUndefined()
  })
})

describe('GiteaProvider', () => {
  it('serves only configured hosts and builds canonical URLs', () => {
    const { run } = recorder(args => dispatch(args))
    const gitea = provider(run)
    expect(gitea.repositoryFromRemote('git@gitea.example.org:owner/repo.git')).toEqual({
      forge: 'gitea', host: 'gitea.example.org', owner: 'owner', name: 'repo',
    })
    expect(gitea.repositoryFromRemote('git@gitea.com:owner/repo.git')).toBeUndefined()
    expect(gitea.changeRequestFromUrl('https://gitea.example.org/owner/repo/pulls/3')).toEqual(ref)
    expect(gitea.changeRequestUrl(ref)).toBe('https://gitea.example.org/owner/repo/pulls/3')
  })

  it('maps a pull request and its checks to a snapshot', async () => {
    const { run, calls } = recorder(args => dispatch(args))
    const results = await provider(run).fetch([ref], new AbortController().signal)
    const snapshot = results.get(KEY)
    expect(snapshot).toMatchObject({
      url: 'https://gitea.example.org/owner/repo/pulls/3',
      title: 'Add a thing',
      state: 'open',
      draft: false,
      author: 'tak',
      headBranch: 'feature/thing',
      headSha: HEAD,
      baseBranch: 'main',
      baseSha: BASE,
      additions: 4,
      deletions: 2,
      mergeability: 'mergeable',
      mergeReady: true,
      mergeMethods: ['merge', 'squash', 'rebase'],
      checksRollup: 'success',
      updatedAt: '2026-11-13T00:00:00Z',
      closedAt: null,
    })
    expect(snapshot).not.toHaveProperty('code')
    expect(calls.some(call => call.join(' ').includes('/statuses'))).toBe(true)
  })

  it('maps a merged or draft pull request', async () => {
    const { run } = recorder(args => dispatch(args, {
      'pulls/3': ok(pullRequest({ merged: true, merged_at: '2026-11-13T01:00:00Z', title: 'WIP: thing' })),
    }))
    const results = await provider(run).fetch([ref], new AbortController().signal)
    expect(results.get(KEY)).toMatchObject({
      state: 'merged', draft: true, mergeReady: false, closedAt: '2026-11-13T01:00:00Z',
    })
  })

  it('keeps a snapshot when the status read fails', async () => {
    const { run } = recorder(args => dispatch(args, {
      '/statuses': { exitCode: 1, stdout: '', stderr: 'boom' },
    }))
    const results = await provider(run).fetch([ref], new AbortController().signal)
    expect(results.get(KEY)).toMatchObject({ checks: [], checksRollup: 'none' })
  })

  it('reports a refusal in the fetch map', async () => {
    const { run } = recorder(() => ({ exitCode: 1, stdout: '{"message":"404 Not Found"}', stderr: '' }))
    expect((await provider(run).fetch([ref], new AbortController().signal)).get(KEY))
      .toEqual({ code: 'not-found', message: '404 Not Found' })
  })

  it('reads the patch at the confirmed head', async () => {
    const { run } = recorder(args => dispatch(args))
    expect(await provider(run).diff(ref, HEAD, new AbortController().signal)).toBe(DIFF)
  })

  it('reports a moved head as stale', async () => {
    const { run } = recorder(args => dispatch(args, { 'pulls/3': ok(pullRequest({ head: { ref: 'feature/thing', sha: MOVED } })) }))
    expect(await provider(run).diff(ref, HEAD, new AbortController().signal)).toMatchObject({ code: 'stale' })
  })

  it('merges through the API with the confirmed head', async () => {
    const { run, calls } = recorder(args => args.includes('merge') ? ok('{}') : dispatch(args))
    expect(await provider(run).merge(ref, { method: 'squash', headSha: HEAD }, new AbortController().signal)).toBeUndefined()
    expect(calls[0]).toEqual([
      'api', '-X', 'POST', 'repos/owner/repo/pulls/3/merge', '-f', 'Do=squash', '-f', `head_commit_id=${HEAD}`,
      '--host', 'gitea.example.org', '--no-input',
    ])
  })

  it('reports a merge refused because the head moved as stale', async () => {
    const { run } = recorder(() => ({ exitCode: 1, stdout: '', stderr: '{"message":"head out of date"}' }))
    expect(await provider(run).merge(ref, { method: 'merge', headSha: HEAD }, new AbortController().signal)).toMatchObject({ code: 'stale' })
  })

  it('reports that Gitea cannot mark a draft ready', async () => {
    const { run, calls } = recorder(args => dispatch(args))
    expect(await provider(run).markReady(ref, new AbortController().signal)).toEqual({
      code: 'failed', message: 'Gitea does not support draft pull requests',
    })
    expect(calls).toEqual([])
  })

  it('reads a file and builds its web URL', async () => {
    const { run, calls } = recorder(args => dispatch(args))
    const gitea = provider(run)
    expect(await gitea.fileText(ref, HEAD, 'src/a.txt', new AbortController().signal)).toBe('file contents')
    expect(calls[0]?.join(' ')).toContain(`raw/src/a.txt?ref=${HEAD}`)
    expect(gitea.fileUrl(ref, HEAD, 'src/a.txt')).toBe(`https://gitea.example.org/owner/repo/src/commit/${HEAD}/src/a.txt`)
  })

  it('finds pull requests whose head is the branch and skips forks', async () => {
    const { run } = recorder(args => dispatch(args, {
      'pulls?state=open': ok(JSON.stringify([
        { number: 3, head: { ref: 'feature/thing', repo_id: 1 }, base: { repo_id: 1 } },
        { number: 4, head: { ref: 'feature/thing', repo_id: 2 }, base: { repo_id: 1 } },
        { number: 5, head: { ref: 'other', repo_id: 1 }, base: { repo_id: 1 } },
      ])),
    }))
    expect(await provider(run).findByHead(ref.repository, 'feature/thing', new AbortController().signal))
      .toEqual([{ repository: ref.repository, number: 3 }])
  })

  it('reports readiness from gt auth status', async () => {
    const ready = recorder(() => ok('gitea.example.org: tak'))
    expect(await provider(ready.run).readiness('gitea.example.org', new AbortController().signal)).toEqual({ state: 'ready', message: null })
    const signedOut = recorder(() => ({ exitCode: 4, stdout: '', stderr: 'no account' }))
    expect(await provider(signedOut.run).readiness('gitea.example.org', new AbortController().signal)).toMatchObject({ state: 'unauthenticated' })
    const unreachable = recorder(() => ({ exitCode: 1, stdout: '', stderr: 'dial tcp: refused' }))
    expect(await provider(unreachable.run).readiness('gitea.example.org', new AbortController().signal)).toMatchObject({ state: 'unavailable' })
    const missing = recorder(() => { throw new CliUnavailableError('gt could not start') })
    expect(await provider(missing.run).readiness('gitea.example.org', new AbortController().signal)).toMatchObject({ state: 'unavailable' })
  })
})
