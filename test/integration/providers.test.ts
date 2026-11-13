import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changeRequestKey } from '@deepseek-ai/dsh-experimental-forge'
import type { ChangeRequestRef } from '@deepseek-ai/dsh-experimental-forge'
import { createCliRunner } from '../../src/core/cli.js'
import { GiteaProvider } from '../../src/providers/gitea/provider.js'
import { GiteeProvider } from '../../src/providers/gitee/provider.js'
import { GitLabProvider } from '../../src/providers/gitlab/provider.js'

const HEAD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)
const MOVED = 'c'.repeat(40)

const gitlabRef: ChangeRequestRef = {
  repository: { forge: 'gitlab', host: 'gitlab.com', owner: 'group/sub', name: 'repo' },
  number: 3,
}
const giteaRef: ChangeRequestRef = {
  repository: { forge: 'gitea', host: 'gitea.example.org', owner: 'owner', name: 'repo' },
  number: 3,
}
const giteeRef: ChangeRequestRef = {
  repository: { forge: 'gitee', host: 'gitee.com', owner: 'owner', name: 'repo' },
  number: 5,
}

let dir = ''

/** Write one executable fake CLI whose recorded responses live in `dir`. */
async function fakeCli(name: string, script: string): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, `#!/bin/sh\n${script}\n`, { mode: 0o755 })
  return path
}

async function fixture(name: string, value: unknown): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, JSON.stringify(value), 'utf8')
  return path
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsh-gitall-'))

  await fixture('mr.json', {
    iid: 3,
    title: 'GitLab change',
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
    head_pipeline: { id: 1, name: 'CI', status: 'success', created_at: '2026-11-12T00:00:00Z', finished_at: '2026-11-12T00:10:00Z' },
  })
  await fixture('diffs.json', [{ old_path: 'a.txt', new_path: 'a.txt', diff: '@@ -1 +1 @@\n-old\n+new\n', new_file: false, deleted_file: false, too_large: false }])
  await fakeCli('glab', `case "$*" in
  "auth status --hostname gitlab.com") echo "Logged in to gitlab.com as tak"; exit 0 ;;
  *"diffs?per_page"*) cat "${join(dir, 'diffs.json')}"; exit 0 ;;
  *"merge_requests 3"*) cat "${join(dir, 'mr.json')}"; exit 0 ;;
  *"mr merge"*) case "$*" in *"--sha ${HEAD}"*) exit 0 ;; esac; echo "head out of date (HTTP 409)" >&2; exit 1 ;;
  *"mr update"*) exit 0 ;;
  *"repository/files"*) printf 'file contents'; exit 0 ;;
esac
echo "unexpected glab: $*" >&2; exit 1`)

  await fixture('pr.json', {
    number: 3,
    title: 'Gitea change',
    state: 'open',
    draft: false,
    merged: false,
    merged_at: null,
    closed_at: null,
    mergeable: true,
    additions: 2,
    deletions: 1,
    updated_at: '2026-11-13T00:00:00Z',
    user: { login: 'tak' },
    head: { ref: 'feature/thing', sha: HEAD, repo_id: 1 },
    base: { ref: 'main', sha: BASE, repo_id: 1 },
    html_url: 'https://gitea.example.org/owner/repo/pulls/3',
  })
  await fixture('statuses.json', [{ status: 'success', context: 'ci/build', target_url: null, created_at: '2026-11-12T00:00:00Z', updated_at: '2026-11-12T00:10:00Z' }])
  await writeFile(join(dir, 'pull.diff'), 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n', 'utf8')
  await fakeCli('gt', `case "$*" in
  "auth status --host gitea.example.org") exit 0 ;;
  *"pulls/3.diff"*) cat "${join(dir, 'pull.diff')}"; exit 0 ;;
  *"/statuses"*) cat "${join(dir, 'statuses.json')}"; exit 0 ;;
  *"-X POST"*) case "$*" in *"head_commit_id=${HEAD}"*) exit 0 ;; esac; echo '{"message":"head out of date"}' >&2; exit 1 ;;
  *"pulls/3"*) cat "${join(dir, 'pr.json')}"; exit 0 ;;
  *"/raw/"*) printf 'file contents'; exit 0 ;;
esac
echo "unexpected gt: $*" >&2; exit 1`)

  await fixture('gitee-pr.json', {
    number: 5,
    title: 'Gitee change',
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
  })
  await fixture('gitee-files.json', [{
    filename: 'a.txt',
    status: 'modified',
    additions: '2',
    deletions: '1',
    patch: { diff: '@@ -1 +1 @@\n-old\n+new\n', old_path: 'a.txt', new_path: 'a.txt', new_file: false, renamed_file: false, deleted_file: false, too_large: false },
  }])
  await fakeCli('gitee', `case "$*" in
  *"auth status"*) echo '{"status":"logged in","host":"gitee.com","user":"tak"}'; exit 0 ;;
  *"pulls/5/files"*) cat "${join(dir, 'gitee-files.json')}"; exit 0 ;;
  *"-X PUT"*) exit 0 ;;
  *"pulls/5"*) cat "${join(dir, 'gitee-pr.json')}"; exit 0 ;;
  *"/contents/"*) printf '{"type":"file","content":"ZmlsZSBjb250ZW50cw=="}'; exit 0 ;;
esac
echo "unexpected gitee: $*" >&2; exit 1`)
})

afterAll(async () => {
  if (dir.length > 0) await rm(dir, { recursive: true, force: true })
})

const limits = { timeoutMs: 10_000, maxOutputBytes: 1_048_576 }
const signal = (): AbortSignal => new AbortController().signal

describe('providers through fake CLIs', () => {
  it('reads a GitLab merge request, its patch, and a stale merge', async () => {
    const gitlab = new GitLabProvider(createCliRunner(join(dir, 'glab'), limits), { command: 'glab', hosts: ['gitlab.com'] })
    const snapshot = (await gitlab.fetch([gitlabRef], signal())).get(changeRequestKey(gitlabRef))
    expect(snapshot).toMatchObject({ title: 'GitLab change', state: 'open', headSha: HEAD, additions: 1, mergeReady: true, checksRollup: 'success' })
    expect(await gitlab.diff(gitlabRef, HEAD, signal())).toContain('diff --git a/a.txt b/a.txt')
    expect(await gitlab.merge(gitlabRef, { method: 'merge', headSha: MOVED }, signal())).toMatchObject({ code: 'stale' })
    expect(await gitlab.merge(gitlabRef, { method: 'merge', headSha: HEAD }, signal())).toBeUndefined()
  })

  it('reads a Gitea pull request, its patch, and a stale merge', async () => {
    const gitea = new GiteaProvider(createCliRunner(join(dir, 'gt'), limits), { command: 'gt', hosts: ['gitea.example.org'] })
    const snapshot = (await gitea.fetch([giteaRef], signal())).get(changeRequestKey(giteaRef))
    expect(snapshot).toMatchObject({ title: 'Gitea change', state: 'open', headSha: HEAD, additions: 2, mergeReady: true, checksRollup: 'success' })
    expect(await gitea.diff(giteaRef, HEAD, signal())).toContain('diff --git a/a.txt b/a.txt')
    expect(await gitea.merge(giteaRef, { method: 'merge', headSha: MOVED }, signal())).toMatchObject({ code: 'stale' })
    expect(await gitea.merge(giteaRef, { method: 'merge', headSha: HEAD }, signal())).toBeUndefined()
  })

  it('reads a Gitee pull request, its patch, and a stale merge', async () => {
    const gitee = new GiteeProvider(createCliRunner(join(dir, 'gitee'), limits), { command: 'gitee', hosts: ['gitee.com'] })
    const snapshot = (await gitee.fetch([giteeRef], signal())).get(changeRequestKey(giteeRef))
    expect(snapshot).toMatchObject({ title: 'Gitee change', state: 'open', headSha: HEAD, additions: 2, mergeReady: true, checks: [] })
    expect(await gitee.diff(giteeRef, HEAD, signal())).toContain('diff --git a/a.txt b/a.txt')
    expect(await gitee.merge(giteeRef, { method: 'merge', headSha: MOVED }, signal())).toMatchObject({ code: 'stale' })
    expect(await gitee.merge(giteeRef, { method: 'merge', headSha: HEAD }, signal())).toBeUndefined()
  })
})
