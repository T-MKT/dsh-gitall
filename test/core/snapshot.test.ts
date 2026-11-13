import { describe, expect, it } from 'vitest'
import type { ChangeRequestCheck, ChangeRequestRef } from '@deepseek-ai/dsh-experimental-forge'
import { checksRollupOf, snapshotOf } from '../../src/core/snapshot.js'
import type { SnapshotFields } from '../../src/core/snapshot.js'

const ref: ChangeRequestRef = {
  repository: { forge: 'gitlab', host: 'gitlab.com', owner: 'group/sub', name: 'repo' },
  number: 7,
}

const fields: SnapshotFields = {
  url: 'https://gitlab.com/group/sub/repo/-/merge_requests/7',
  title: 'Add a thing',
  state: 'open',
  draft: false,
  author: 'tak',
  headBranch: 'feature/thing',
  headSha: 'a'.repeat(40),
  baseBranch: 'main',
  baseSha: 'b'.repeat(40),
  additions: 3,
  deletions: 1,
  mergeability: 'mergeable',
  mergeReady: true,
  mergeMethods: ['merge', 'squash', 'rebase'],
  checks: [],
  updatedAt: '2026-11-13T00:00:00Z',
  closedAt: null,
}

function check(state: ChangeRequestCheck['state']): ChangeRequestCheck {
  return {
    name: 'ci',
    state,
    url: null,
    workflow: null,
    startedAt: null,
    completedAt: null,
    rerun: null,
  }
}

describe('snapshotOf', () => {
  it('fills the unimplemented sections with their defaults', () => {
    const snapshot = snapshotOf(ref, fields)
    expect(snapshot.ref).toBe(ref)
    expect(snapshot.branchUpdates).toEqual([])
    expect(snapshot.reviewDecision).toBe('none')
    expect(snapshot.reviewers).toEqual([])
    expect(snapshot.canRequestReviews).toBe(false)
    expect(snapshot.canRerunChecks).toBe(false)
    expect(snapshot.unresolvedThreads).toBe(0)
    expect(snapshot.closingIssues).toEqual([])
    expect(snapshot.checksRollup).toBe('none')
  })

  it('carries an optional base commit only when reported', () => {
    expect(snapshotOf(ref, fields).baseSha).toBe('b'.repeat(40))
    const { baseSha: _baseSha, ...withoutBase } = fields
    void _baseSha
    expect('baseSha' in snapshotOf(ref, withoutBase)).toBe(false)
  })
})

describe('checksRollupOf', () => {
  it('combines outcomes by severity', () => {
    expect(checksRollupOf([])).toBe('none')
    expect(checksRollupOf([check('success'), check('skipped')])).toBe('success')
    expect(checksRollupOf([check('success'), check('pending')])).toBe('pending')
    expect(checksRollupOf([check('pending'), check('failure')])).toBe('failure')
  })
})
