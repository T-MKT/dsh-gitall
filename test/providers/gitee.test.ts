import { describe, expect, it } from 'vitest'
import { changeRequestKey } from '@deepseek-ai/dsh-experimental-forge'
import type { ChangeRequestRef } from '@deepseek-ai/dsh-experimental-forge'
import { CliUnavailableError } from '../../src/core/cli.js'
import type { CliOutput, CliRunner } from '../../src/core/cli.js'
import { GiteeProvider } from '../../src/providers/gitee/provider.js'
import { parsePullRequestUrl, parseRemoteUrl } from '../../src/providers/gitee/urls.js'

const HEAD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)
const MOVED = 'c'.repeat(40)
const PATCH = '@@ -1 +1,2 @@\n-old\n+new\n+more\n'

const provider = (run: CliRunner): GiteeProvider => new GiteeProvider(run, { command: 'gitee', hosts: ['gitee.com'] })

const ref: ChangeRequestRef = {
  repository: { forge: 'gitee', host: 'gitee.com', owner: 'owner', name: 'repo' },
  number: 5,
}
const KEY = changeRequestKey(ref)

const pullRequest = (override: Record<string, unknown> = {}): string => JSON.stringify({
  number: 5,
  title: 'Gitee thing',
  state: 'open',
  draft: false,
  mergeable: true,
  merged_at: null,
  closed_at: null,
  updated_at: '2026-11-13T00:00:00Z',
  user: { login: 'tak' },
  head: { ref: 'feature/thing', sha: HEAD, label: 'owner:feature/thing' },
  base: { ref: 'main', sha: BASE, label: 'owner:main' },
  html_url: 'https://gitee.com/owner/repo/pulls/5',
  ...override,
})

const files = (override: Record<string, unknown> = {}): string => JSON.stringify([{
  filename: 'a.txt',
  status: 'modified',
  additions: '3',
  deletions: '1',
  patch: {
    diff: PATCH,
    old_path: 'a.txt',
    new_path: 'a.txt',
    new_file: false,
    renamed_file: false,
    deleted_file: false,
    too_large: false,
    ...override,
  },
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
  if (args[0] === 'auth') return ok(JSON.stringify({ status: 'logged in', host: 'gitee.com', user: 'tak' }))
  if (joined.includes('pulls/5/files')) return ok(files())
  if (joined.includes('pulls?state=open')) {
    return ok(JSON.stringify([{ number: 5, head: { ref: 'feature/thing', label: 'owner:feature/thing' }, base: { label: 'owner:main' } }]))
  }
  if (joined.includes('pulls/5')) return ok(pullRequest())
  if (joined.includes('/contents/')) return ok(JSON.stringify({ type: 'file', content: Buffer.from('file contents', 'utf8').toString('base64') }))
  return { exitCode: 1, stdout: '', stderr: `unexpected command: ${joined}` }
}

describe('Gitee URLs', () => {
  it('parses remotes and pull request URLs', () => {
    expect(parseRemoteUrl('https://gitee.com/owner/repo.git')).toEqual({ host: 'gitee.com', owner: 'owner', name: 'repo' })
    expect(parseRemoteUrl('git@gitee.com:owner/repo.git')).toEqual({ host: 'gitee.com', owner: 'owner', name: 'repo' })
    expect(parseRemoteUrl('ssh://git@git.example.org:2222/owner/repo')).toEqual({ host: 'git.example.org', owner: 'owner', name: 'repo' })
    expect(parseRemoteUrl('https://gitee.com/owner')).toBeUndefined()
    expect(parsePullRequestUrl('https://gitee.com/owner/repo/pulls/5/files')).toEqual({
      host: 'gitee.com', owner: 'owner', name: 'repo', number: 5,
    })
    expect(parsePullRequestUrl('https://gitee.com/owner/repo/issues/5')).toBeUndefined()
  })
})

describe('GiteeProvider', () => {
  it('serves only configured hosts and builds canonical URLs', () => {
    const { run } = recorder(args => dispatch(args))
    const gitee = provider(run)
    expect(gitee.repositoryFromRemote('git@gitee.com:owner/repo.git')).toEqual({
      forge: 'gitee', host: 'gitee.com', owner: 'owner', name: 'repo',
    })
    expect(gitee.repositoryFromRemote('git@example.com:owner/repo.git')).toBeUndefined()
    expect(gitee.changeRequestFromUrl('https://gitee.com/owner/repo/pulls/5')).toEqual(ref)
    expect(gitee.changeRequestUrl(ref)).toBe('https://gitee.com/owner/repo/pulls/5')
  })

  it('maps a pull request and its changed files to a snapshot without checks', async () => {
    const { run } = recorder(args => dispatch(args))
    const snapshot = (await provider(run).fetch([ref], new AbortController().signal)).get(KEY)
    expect(snapshot).toMatchObject({
      url: 'https://gitee.com/owner/repo/pulls/5',
      title: 'Gitee thing',
      state: 'open',
      draft: false,
      author: 'tak',
      headBranch: 'feature/thing',
      headSha: HEAD,
      baseBranch: 'main',
      baseSha: BASE,
      additions: 3,
      deletions: 1,
      mergeability: 'mergeable',
      mergeReady: true,
      mergeMethods: ['merge', 'squash'],
      checks: [],
      checksRollup: 'none',
      updatedAt: '2026-11-13T00:00:00Z',
      closedAt: null,
    })
  })

  it('keeps a snapshot when the files read fails', async () => {
    const { run } = recorder(args => dispatch(args, { 'pulls/5/files': { exitCode: 1, stdout: '', stderr: 'boom' } }))
    expect((await provider(run).fetch([ref], new AbortController().signal)).get(KEY))
      .toMatchObject({ additions: 0, deletions: 0 })
  })

  it('maps a merged or draft pull request', async () => {
    const { run } = recorder(args => dispatch(args, {
      'pulls/5': ok(pullRequest({ merged_at: '2026-11-13T01:00:00Z', title: '[WIP] thing' })),
    }))
    expect((await provider(run).fetch([ref], new AbortController().signal)).get(KEY))
      .toMatchObject({ state: 'merged', draft: true, mergeReady: false, closedAt: '2026-11-13T01:00:00Z' })
  })

  it('reports a refusal in the fetch map', async () => {
    const { run } = recorder(() => ({ exitCode: 1, stdout: '', stderr: 'HTTP 404: {"message":"Not Found"}' }))
    expect((await provider(run).fetch([ref], new AbortController().signal)).get(KEY))
      .toMatchObject({ code: 'not-found' })
  })

  it('assembles the patch from changed files', async () => {
    const { run } = recorder(args => dispatch(args))
    expect(await provider(run).diff(ref, HEAD, new AbortController().signal)).toBe(
      `diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n${PATCH}`,
    )
  })

  it('reports a moved head as stale', async () => {
    const { run } = recorder(args => dispatch(args, { 'pulls/5': ok(pullRequest({ head: { ref: 'feature/thing', sha: MOVED } })) }))
    expect(await provider(run).diff(ref, HEAD, new AbortController().signal)).toMatchObject({ code: 'stale' })
  })

  it('reports a diff Gitee refused to render as too large', async () => {
    const { run } = recorder(args => dispatch(args, { 'pulls/5/files': ok(files({ too_large: true })) }))
    expect(await provider(run).diff(ref, HEAD, new AbortController().signal)).toMatchObject({ code: 'too-large' })
  })

  it('merges after confirming the head', async () => {
    const { run, calls } = recorder(args => args.some(arg => arg.endsWith('/merge')) ? ok('{}') : dispatch(args))
    expect(await provider(run).merge(ref, { method: 'squash', headSha: HEAD }, new AbortController().signal)).toBeUndefined()
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual([
      'api', '-X', 'PUT', '/repos/owner/repo/pulls/5/merge', '-f', 'merge_method=squash', '--hostname', 'gitee.com', '--no-tui',
    ])
  })

  it('does not merge a pull request whose head moved', async () => {
    const { run, calls } = recorder(args => dispatch(args, { 'pulls/5': ok(pullRequest({ head: { ref: 'feature/thing', sha: MOVED } })) }))
    expect(await provider(run).merge(ref, { method: 'merge', headSha: HEAD }, new AbortController().signal)).toMatchObject({ code: 'stale' })
    expect(calls).toHaveLength(1)
  })

  it('refuses a rebase merge without a request', async () => {
    const { run, calls } = recorder(args => dispatch(args))
    expect(await provider(run).merge(ref, { method: 'rebase', headSha: HEAD }, new AbortController().signal)).toMatchObject({ code: 'failed' })
    expect(calls).toHaveLength(0)
  })

  it('passes a merge refusal through', async () => {
    const { run } = recorder(args => args.some(arg => arg.endsWith('/merge'))
      ? { exitCode: 1, stdout: '', stderr: 'Validation failed (422): merge conflict' }
      : dispatch(args))
    expect(await provider(run).merge(ref, { method: 'merge', headSha: HEAD }, new AbortController().signal)).toEqual({
      code: 'failed', message: 'Validation failed (422): merge conflict',
    })
  })

  it('clears the draft flag', async () => {
    const { run, calls } = recorder(() => ok('{}'))
    expect(await provider(run).markReady(ref, new AbortController().signal)).toBeUndefined()
    expect(calls[0]).toContain('--body')
    expect(calls[0]?.[1]).toBe('-X')
    expect(calls[0]?.[2]).toBe('PATCH')
  })

  it('decodes a file and builds its web URL', async () => {
    const { run } = recorder(args => dispatch(args))
    const gitee = provider(run)
    expect(await gitee.fileText(ref, HEAD, 'src/a.txt', new AbortController().signal)).toBe('file contents')
    expect(gitee.fileUrl(ref, HEAD, 'src/a.txt')).toBe(`https://gitee.com/owner/repo/blob/${HEAD}/src/a.txt`)
    const missing = recorder(() => ok(JSON.stringify({ type: 'dir' })))
    expect(await provider(missing.run).fileText(ref, HEAD, 'src', new AbortController().signal)).toMatchObject({ code: 'not-found' })
  })

  it('finds pull requests whose head is the branch and skips forks', async () => {
    const { run } = recorder(args => dispatch(args, {
      'pulls?state=open': ok(JSON.stringify([
        { number: 5, head: { ref: 'feature/thing', label: 'owner:feature/thing' }, base: { label: 'owner:main' } },
        { number: 6, head: { ref: 'feature/thing', label: 'fork:feature/thing' }, base: { label: 'owner:main' } },
        { number: 7, head: { ref: 'other', label: 'owner:other' }, base: { label: 'owner:main' } },
      ])),
    }))
    expect(await provider(run).findByHead(ref.repository, 'feature/thing', new AbortController().signal))
      .toEqual([{ repository: ref.repository, number: 5 }])
  })

  it('reports readiness from gitee auth status', async () => {
    const ready = recorder(() => ok(JSON.stringify({ status: 'logged in' })))
    expect(await provider(ready.run).readiness('gitee.com', new AbortController().signal)).toEqual({ state: 'ready', message: null })
    const signedOut = recorder(() => ok(JSON.stringify({ status: 'not logged in' })))
    expect(await provider(signedOut.run).readiness('gitee.com', new AbortController().signal)).toMatchObject({ state: 'unauthenticated' })
    const missing = recorder(() => { throw new CliUnavailableError('gitee could not start') })
    expect(await provider(missing.run).readiness('gitee.com', new AbortController().signal)).toMatchObject({ state: 'unavailable' })
  })
})
