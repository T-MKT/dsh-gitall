import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'

describe('resolveConfig', () => {
  it('applies the per-forge defaults', () => {
    expect(resolveConfig({})).toEqual({
      gitlab: { command: 'glab', hosts: ['gitlab.com'] },
      gitea: { command: 'gt', hosts: [] },
      gitee: { command: 'gitee', hosts: ['gitee.com'] },
      timeoutMs: 30_000,
      maxOutputBytes: 8_388_608,
      binding: true,
    })
  })

  it('merges partial per-forge settings over the defaults', () => {
    const resolved = resolveConfig({ gitea: { hosts: ['Git.Example.org:3000'] } })
    expect(resolved.gitea).toEqual({ command: 'gt', hosts: ['git.example.org:3000'] })
    expect(resolved.gitlab).toEqual({ command: 'glab', hosts: ['gitlab.com'] })
  })

  it('rejects an empty command', () => {
    expect(() => resolveConfig({ gitlab: { command: '   ' } })).toThrow(/gitlab\.command must not be empty/)
  })

  it('rejects a malformed host', () => {
    expect(() => resolveConfig({ gitee: { hosts: ['https://gitee.com'] } })).toThrow(/invalid host/)
    expect(() => resolveConfig({ gitlab: { hosts: ['gitlab.com/path'] } })).toThrow(/invalid host/)
  })

  it('rejects a limit that is not a positive safe integer', () => {
    expect(() => resolveConfig({ timeoutMs: 0 })).toThrow(/timeoutMs/)
    expect(() => resolveConfig({ timeoutMs: 1.5 })).toThrow(/timeoutMs/)
    expect(() => resolveConfig({ maxOutputBytes: -1 })).toThrow(/maxOutputBytes/)
  })
})
