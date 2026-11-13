import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ChangeRequestRef } from '@deepseek-ai/dsh-experimental-forge'

const { appendPluginRecord } = vi.hoisted(() => ({ appendPluginRecord: vi.fn() }))

vi.mock('@deepseek-ai/dsh-session', () => ({ appendPluginRecord }))

const { startBinding } = await import('../../src/binding/service.js')

const ref: ChangeRequestRef = {
  repository: { forge: 'gitlab', host: 'gitlab.com', owner: 'group', name: 'repo' },
  number: 7,
}

type Handler = (exec: unknown, result: unknown) => void

interface Harness {
  readonly warnings: string[]
  readonly fire: (exec: unknown, result: unknown) => void
}

function harness(recognized: ReadonlyMap<string, ChangeRequestRef>): Harness {
  let handler: Handler | undefined
  const warnings: string[] = []
  const ctx = {
    inject: (deps: readonly string[], callback: (scope: unknown) => void) => {
      expect(deps).toEqual(['tools'])
      callback({
        on: (event: string, registered: Handler) => {
          expect(event).toBe('tools/result')
          handler = registered
        },
        logger: { warn: (message: string) => warnings.push(message) },
      })
    },
    forge: {
      changeRequestFromUrl: (url: string) => recognized.get(url),
      changeRequestUrl: (target: ChangeRequestRef) => `https://${target.repository.host}/${target.repository.owner}/${target.repository.name}/-/merge_requests/${target.number}`,
    },
  }
  startBinding(ctx as unknown as Context)
  return {
    warnings,
    fire: (exec, result) => {
      if (handler === undefined) throw new Error('startBinding did not register a tools/result handler')
      handler(exec, result)
    },
  }
}

const session = { id: 's1' }

function execution(command: string, overrides: Record<string, unknown> = {}): unknown {
  return {
    name: 'bash',
    agent: { session },
    parent: undefined,
    arguments: { command },
    ...overrides,
  }
}

function result(text: string, overrides: Record<string, unknown> = {}): unknown {
  return { content: [{ type: 'text', text }], isError: false, ...overrides }
}

const recognized = new Map<string, ChangeRequestRef>([[
  'https://gitlab.com/group/repo/-/merge_requests/7',
  ref,
]])

describe('startBinding', () => {
  beforeEach(() => {
    appendPluginRecord.mockReset()
  })

  it('binds a recognized URL printed by a glab call', () => {
    const { fire } = harness(recognized)
    fire(execution('glab mr view 7'), result('url: https://gitlab.com/group/repo/-/merge_requests/7'))
    expect(appendPluginRecord).toHaveBeenCalledTimes(1)
    expect(appendPluginRecord).toHaveBeenCalledWith(session, 'plugin:forge-session/binding', {
      action: 'reference',
      url: 'https://gitlab.com/group/repo/-/merge_requests/7',
    })
  })

  it('writes a Session and URL at most once', () => {
    const { fire } = harness(recognized)
    const exec = execution('glab mr view 7')
    const output = result('https://gitlab.com/group/repo/-/merge_requests/7')
    fire(exec, output)
    fire(exec, output)
    expect(appendPluginRecord).toHaveBeenCalledTimes(1)
  })

  it('keeps the dedupe per Session', () => {
    const { fire } = harness(recognized)
    const output = result('https://gitlab.com/group/repo/-/merge_requests/7')
    fire(execution('glab mr view 7'), output)
    fire(execution('glab mr view 7', { agent: { session: { id: 's2' } } }), output)
    expect(appendPluginRecord).toHaveBeenCalledTimes(2)
  })

  it('ignores other CLIs, other tools, failures, and unrecognized URLs', () => {
    const { fire } = harness(recognized)
    fire(execution('gh pr create'), result('https://gitlab.com/group/repo/-/merge_requests/7'))
    fire(execution('glab mr view 7', { name: 'read' }), result('https://gitlab.com/group/repo/-/merge_requests/7'))
    fire(execution('glab mr view 7', { parent: {} }), result('https://gitlab.com/group/repo/-/merge_requests/7'))
    fire(execution('glab mr view 7'), result('https://gitlab.com/group/repo/-/merge_requests/7', { isError: true }))
    fire(execution('glab mr view 9'), result('https://gitlab.com/group/repo/-/merge_requests/9'))
    expect(appendPluginRecord).not.toHaveBeenCalled()
  })

  it('swallows a rejected append and warns', () => {
    appendPluginRecord.mockImplementation(() => {
      throw new Error('session is not entered')
    })
    const { fire, warnings } = harness(recognized)
    expect(() => fire(execution('glab mr view 7'), result('https://gitlab.com/group/repo/-/merge_requests/7'))).not.toThrow()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('session is not entered')
  })
})
