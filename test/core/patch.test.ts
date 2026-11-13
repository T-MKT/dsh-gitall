import { describe, expect, it } from 'vitest'
import { unifiedPatch } from '../../src/core/patch.js'

describe('unifiedPatch', () => {
  it('returns an empty patch without files', () => {
    expect(unifiedPatch([])).toBe('')
  })

  it('writes one section per modified file', () => {
    expect(unifiedPatch([{ oldPath: 'a.txt', newPath: 'a.txt', body: '@@ -1 +1 @@\n-old\n+new\n' }])).toBe(
      'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n',
    )
  })

  it('terminates a hunk that the host did not terminate', () => {
    expect(unifiedPatch([{ oldPath: 'a.txt', newPath: 'a.txt', body: '@@ -1 +1 @@\n-old\n+new' }])).toContain('+new\n')
  })

  it('uses /dev/null for an added file', () => {
    expect(unifiedPatch([{ oldPath: 'new.txt', newPath: 'new.txt', body: '@@ -0,0 +1 @@\n+x\n', newFile: true }])).toBe(
      'diff --git a/new.txt b/new.txt\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+x\n',
    )
  })

  it('uses /dev/null for a deleted file', () => {
    expect(unifiedPatch([{ oldPath: 'gone.txt', newPath: 'gone.txt', body: '@@ -1 +0,0 @@\n-x\n', deletedFile: true }])).toBe(
      'diff --git a/gone.txt b/gone.txt\n--- a/gone.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n',
    )
  })

  it('keeps both paths of a rename', () => {
    expect(unifiedPatch([{ oldPath: 'old.txt', newPath: 'new.txt', body: '@@ -1 +1 @@\n-x\n+y\n' }])).toBe(
      'diff --git a/old.txt b/new.txt\n--- a/old.txt\n+++ b/new.txt\n@@ -1 +1 @@\n-x\n+y\n',
    )
  })

  it('keeps a file whose content the host omitted', () => {
    expect(unifiedPatch([{ oldPath: 'image.png', newPath: 'image.png', body: '' }])).toBe(
      'diff --git a/image.png b/image.png\n--- a/image.png\n+++ b/image.png\n',
    )
  })
})
