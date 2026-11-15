import { describe, expect, it } from 'vitest'
import { changeRequestUrlsIn, cliOf, commandOf } from '../../src/binding/commands.js'

describe('cliOf', () => {
  it('recognizes the three CLIs', () => {
    expect(cliOf('glab mr create')).toBe('gitlab')
    expect(cliOf('cd repo && gt pr view 3')).toBe('gitea')
    expect(cliOf('gitee pr list')).toBe('gitee')
  })

  it('does not match other commands or words that merely contain a CLI name', () => {
    expect(cliOf('git -C repo push')).toBeUndefined()
    expect(cliOf('gh pr create')).toBeUndefined()
    expect(cliOf('[ 1 -gt 2 ]')).toBeUndefined()
    expect(cliOf('glab-foo list')).toBeUndefined()
    expect(cliOf('gitee-cli list')).toBeUndefined()
  })
})

describe('changeRequestUrlsIn', () => {
  it('extracts distinct URLs without prose punctuation', () => {
    const output = [
      'Created merge request https://gitlab.com/group/sub/repo/-/merge_requests/7.',
      'See <https://gitlab.com/group/sub/repo/-/merge_requests/8>,',
      'again https://gitlab.com/group/sub/repo/-/merge_requests/7',
    ].join('\n')
    expect(changeRequestUrlsIn(output)).toEqual([
      'https://gitlab.com/group/sub/repo/-/merge_requests/7',
      'https://gitlab.com/group/sub/repo/-/merge_requests/8',
    ])
  })

  it('returns nothing without an HTTP URL', () => {
    expect(changeRequestUrlsIn('no links here')).toEqual([])
    expect(changeRequestUrlsIn('ssh://git@example.com/owner/repo.git')).toEqual([])
  })
})

describe('commandOf', () => {
  it('reads a string command from parsed tool arguments', () => {
    expect(commandOf({ command: 'glab mr view 7' })).toBe('glab mr view 7')
    expect(commandOf({ command: 7 })).toBeUndefined()
    expect(commandOf(null)).toBeUndefined()
  })
})
