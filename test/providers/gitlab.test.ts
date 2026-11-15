import { describe, expect, it } from 'vitest'
import { changeRequestKey } from '@deepseek-ai/dsh-experimental-forge'
import type { ChangeRequestRef } from '@deepseek-ai/dsh-experimental-forge'
import { CliUnavailableError } from '../../src/core/cli.js'
import type { CliOutput, CliRunner } from '../../src/core/cli.js'
import { GitLabProvider } from '../../src/providers/gitlab/provider.js'
import { parseMergeRequestUrl, parseRemoteUrl } from '../../src/providers/gitlab/urls.js'

const HEAD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)
const MOVED = 'c'.repeat(40)

const provider = (run: CliRunner): GitLabProvider => new GitLabProvider(run, { command: 'glab', hosts: ['gitlab.com', 'git.example.org:8443'] })

const ref: ChangeRequestRef = {
  repository: { forge: 'gitlab', host: 'gitlab.com', owner: 'group/sub', name: 'repo' },
  number: 7,
}
const KEY = changeRequestKey(ref)

const mergeRequest = (override: Record<string, unknown> = {}): string => JSON.stringify({
  iid: 7,
  title: 'Add a thing',
  state: 'opened',
  draft: false,
  merged_at: null,
  closed_at: null,
  source_branch: 'feature/thing',
  target_branch: 'main',
  sha: HEAD,
  updated_at: '2026-11-13T00:00:00Z',
  author: { username: 'tak' },
  user: { can_merge: true },
  merge_status: 'can_be_merged',
  has_conflicts: false,
  diff_refs: { base_sha: BASE, head_sha: HEAD },
  web_url: 'https://gitlab.com/group/sub/repo/-/merge_requests/7',
  head_pipeline: {
    id: 42,
    name: 'CI',
    status: 'success',
    web_url: 'https://gitlab.com/group/sub/repo/-/pipelines/42',
    created_at: '2026-11-12T23:00:00Z',
    finished_at: '2026-11-13T00:00:00Z',
  },
  ...override,
})

const diffs = (override: Record<string, unknown> = {}): string => JSON.stringify([{
  old_path: 'a.txt',
  new_path: 'a.txt',
  diff: '@@ -1 +1,2 @@\n-old\n+new\n+more\n',
  new_file: false,
  deleted_file: false,
  too_large: false,
  ...override,
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

function dispatch(args: readonly string[], overrides: Record<string, string> = {}): CliOutput {
  const joined = args.join(' ')
  for (const [needle, stdout] of Object.entries(overrides)) {
    if (joined.includes(needle)) return ok(stdout)
  }
  if (args[0] === 'auth') return ok('Logged in to gitlab.com as tak')
  if (joined.includes('diffs?per_page=100&page=1')) return ok(diffs())
  if (joined.includes('merge_requests 7')) return ok(mergeRequest())
  if (joined.includes('repository/files')) return ok('file contents')
  return { exitCode: 1, stdout: '', stderr: `unexpected command: ${joined}` }
}

describe('GitLab URLs', () => {
  it('parses remotes with nested groups and every transport', () => {
    expect(parseRemoteUrl('https://gitlab.com/group/sub/repo.git')).toEqual({ host: 'gitlab.com', owner: 'group/sub', name: 'repo' })
    expect(parseRemoteUrl('git@gitlab.com:group/sub/repo.git')).toEqual({ host: 'gitlab.com', owner: 'group/sub', name: 'repo' })
    expect(parseRemoteUrl('ssh://git@git.example.org:2222/group/repo.git')).toEqual({ host: 'git.example.org', owner: 'group', name: 'repo' })
    expect(parseRemoteUrl('https://git.example.org:8443/group/repo/')).toEqual({ host: 'git.example.org:8443', owner: 'group', name: 'repo' })
    expect(parseRemoteUrl('https://github.com/owner/repo')).toBeDefined()
  })

  it('rejects paths that are not repositories', () => {
    expect(parseRemoteUrl('')).toBeUndefined()
    expect(parseRemoteUrl('https://gitlab.com/onlyowner')).toBeUndefined()
    expect(parseRemoteUrl('https://gitlab.com/group/../repo')).toBeUndefined()
  })

  it('parses canonical and legacy merge request URLs', () => {
    expect(parseMergeRequestUrl('https://gitlab.com/group/sub/repo/-/merge_requests/7/diffs')).toEqual({
      host: 'gitlab.com', owner: 'group/sub', name: 'repo', number: 7,
    })
    expect(parseMergeRequestUrl('https://gitlab.com/group/repo/merge_requests/3')).toEqual({
      host: 'gitlab.com', owner: 'group', name: 'repo', number: 3,
    })
    expect(parseMergeRequestUrl('https://gitlab.com/group/repo/issues/3')).toBeUndefined()
  })
})

describe('GitLabProvider', () => {
  it('serves only configured hosts and builds canonical URLs', () => {
    const { run } = recorder(args => dispatch(args))
    const gitlab = provider(run)
    expect(gitlab.repositoryFromRemote('git@gitlab.com:group/sub/repo.git')).toEqual({
      forge: 'gitlab', host: 'gitlab.com', owner: 'group/sub', name: 'repo',
    })
    expect(gitlab.repositoryFromRemote('git@unknown.example:group/repo.git')).toBeUndefined()
    expect(gitlab.changeRequestFromUrl('https://gitlab.com/group/sub/repo/-/merge_requests/7')).toEqual(ref)
    expect(gitlab.changeRequestFromUrl('https://unknown.example/group/repo/-/merge_requests/7')).toBeUndefined()
    expect(gitlab.changeRequestUrl(ref)).toBe('https://gitlab.com/group/sub/repo/-/merge_requests/7')
  })

  it('maps a merge request and its diff to a snapshot', async () => {
    const { run, calls } = recorder(args => dispatch(args))
    const results = await provider(run).fetch([ref], new AbortController().signal)
    const snapshot = results.get(KEY)
    expect(snapshot).toMatchObject({
      url: 'https://gitlab.com/group/sub/repo/-/merge_requests/7',
      title: 'Add a thing',
      state: 'open',
      draft: false,
      author: 'tak',
      headBranch: 'feature/thing',
      headSha: HEAD,
      baseBranch: 'main',
      baseSha: BASE,
      additions: 2,
      deletions: 1,
      mergeability: 'mergeable',
      mergeReady: true,
      mergeMethods: ['merge', 'squash', 'rebase'],
      checksRollup: 'success',
      updatedAt: '2026-11-13T00:00:00Z',
      closedAt: null,
    })
    expect(snapshot).not.toHaveProperty('code')
    expect(calls[0]).toContain('group%2Fsub%2Frepo')
    expect(calls[0]).toContain('merge_requests')
  })

  it('maps a merged and draft merge request', async () => {
    const { run } = recorder(args => dispatch(args, {
      'merge_requests 7': mergeRequest({ state: 'merged', merged_at: '2026-11-13T01:00:00Z', draft: true }),
    }))
    const results = await provider(run).fetch([ref], new AbortController().signal)
    expect(results.get(KEY)).toMatchObject({
      state: 'merged', draft: true, mergeReady: false, closedAt: '2026-11-13T01:00:00Z',
    })
  })

  it('reports a refusal in the fetch map instead of throwing', async () => {
    const { run } = recorder(args => args[0] === 'auth'
      ? ok('')
      : { exitCode: 1, stdout: '{"message":"404 Project Not Found"}', stderr: '' })
    const results = await provider(run).fetch([ref], new AbortController().signal)
    expect(results.get(KEY)).toEqual({ code: 'not-found', message: '404 Project Not Found' })
  })

  it('reports an unconfigured host in the fetch map', async () => {
    const { run } = recorder(args => dispatch(args))
    const foreign: ChangeRequestRef = { ...ref, repository: { ...ref.repository, host: 'other.example' } }
    const results = await provider(run).fetch([foreign], new AbortController().signal)
    expect(results.get(changeRequestKey(foreign))).toMatchObject({ code: 'unavailable' })
  })

  it('builds a patch at the confirmed head', async () => {
    const { run } = recorder(args => dispatch(args))
    const patch = await provider(run).diff(ref, HEAD, new AbortController().signal)
    expect(patch).toBe('diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1,2 @@\n-old\n+new\n+more\n')
  })

  it('reports a moved head as stale', async () => {
    const { run } = recorder(args => dispatch(args, { 'merge_requests 7': mergeRequest({ sha: MOVED }) }))
    expect(await provider(run).diff(ref, HEAD, new AbortController().signal)).toMatchObject({ code: 'stale' })
  })

  it('reports a diff GitLab refused to render as too large', async () => {
    const { run } = recorder(args => dispatch(args, { 'diffs?per_page': diffs({ too_large: true }) }))
    expect(await provider(run).diff(ref, HEAD, new AbortController().signal)).toMatchObject({ code: 'too-large' })
  })

  it('reads a file and builds its web URL', async () => {
    const { run, calls } = recorder(args => dispatch(args))
    const gitlab = provider(run)
    expect(await gitlab.fileText(ref, HEAD, 'src/a.txt', new AbortController().signal)).toBe('file contents')
    expect(calls[0]?.join(' ')).toContain('raw?ref=' + HEAD)
    expect(gitlab.fileUrl(ref, HEAD, 'src/a.txt')).toBe(`https://gitlab.com/group/sub/repo/-/blob/${HEAD}/src/a.txt`)
  })

  it('finds merge requests whose source is the branch and skips forks', async () => {
    const { run } = recorder(args => args.join(' ').includes('source_branch')
      ? ok(JSON.stringify([
        { iid: 7, source_project_id: 1, target_project_id: 1 },
        { iid: 8, source_project_id: 2, target_project_id: 1 },
      ]))
      : dispatch(args))
    const found = await provider(run).findByHead(ref.repository, 'feature/thing', new AbortController().signal)
    expect(found).toEqual([{ repository: ref.repository, number: 7 }])
  })

  it('merges with the confirmed head and disabled auto-merge', async () => {
    const { run, calls } = recorder(args => args[0] === 'mr' && args[1] === 'merge' ? ok('') : dispatch(args))
    expect(await provider(run).merge(ref, { method: 'squash', headSha: HEAD }, new AbortController().signal)).toBeUndefined()
    const argv = calls[0] ?? []
    expect(argv).toContain('--auto-merge=false')
    expect(argv).toContain('--sha')
    expect(argv).toContain('--squash')
    expect(argv.join(' ')).toContain('https://gitlab.com/group/sub/repo')
  })

  it('reports a merge refused because the head moved as stale', async () => {
    const { run } = recorder(() => ({ exitCode: 1, stdout: '', stderr: 'the head commit does not match (HTTP 409)' }))
    expect(await provider(run).merge(ref, { method: 'merge', headSha: HEAD }, new AbortController().signal)).toMatchObject({ code: 'stale' })
  })

  it('marks a draft ready', async () => {
    const { run, calls } = recorder(() => ok(''))
    expect(await provider(run).markReady(ref, new AbortController().signal)).toBeUndefined()
    expect(calls[0]).toEqual(['mr', 'update', '7', '--ready', '--yes', '-R', 'https://gitlab.com/group/sub/repo'])
  })

  it('reports readiness from glab auth status', async () => {
    const ready = recorder(() => ok('Logged in'))
    expect(await provider(ready.run).readiness('gitlab.com', new AbortController().signal)).toEqual({ state: 'ready', message: null })
    const signedOut = recorder(() => ({ exitCode: 1, stdout: '', stderr: 'not logged in' }))
    expect(await provider(signedOut.run).readiness('gitlab.com', new AbortController().signal)).toMatchObject({ state: 'unauthenticated' })
    const missing = recorder(() => { throw new CliUnavailableError('glab could not start') })
    expect(await provider(missing.run).readiness('gitlab.com', new AbortController().signal)).toMatchObject({ state: 'unavailable' })
    expect(await provider(ready.run).readiness('other.example', new AbortController().signal)).toMatchObject({ state: 'unavailable' })
  })
})
