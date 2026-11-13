import { describe, expect, it } from 'vitest'
import { CliOutputLimitError, CliTimeoutError, CliUnavailableError } from '../../src/core/cli.js'
import { actionFailureOf, arrayOf, asRecord, failureOf, firstLine, parseJson, refusalOf, text } from '../../src/core/json.js'

describe('JSON helpers', () => {
  it('parseJson tolerates diagnostics', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 })
    expect(parseJson('not json')).toBeUndefined()
  })

  it('asRecord keeps objects and rejects arrays and scalars', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 })
    expect(asRecord([])).toBeUndefined()
    expect(asRecord('x')).toBeUndefined()
  })

  it('arrayOf reads arrays only', () => {
    expect(arrayOf([1, 2])).toEqual([1, 2])
    expect(arrayOf({ length: 0 })).toBeUndefined()
  })

  it('text reads strings and finite numbers', () => {
    expect(text('x')).toBe('x')
    expect(text(3)).toBe('3')
    expect(text(Number.NaN)).toBeUndefined()
    expect(text(true)).toBeUndefined()
  })

  it('firstLine skips blank lines', () => {
    expect(firstLine('\n\n  hello \nworld')).toBe('hello')
    expect(firstLine('   ')).toBeNull()
  })
})

describe('failureOf', () => {
  it('maps runner errors', () => {
    expect(failureOf(new CliOutputLimitError('big')).code).toBe('too-large')
    expect(failureOf(new CliTimeoutError('slow')).code).toBe('unavailable')
    expect(failureOf(new CliUnavailableError('missing')).code).toBe('unavailable')
  })

  it('maps authentication wording', () => {
    expect(failureOf(new Error('HTTP 401 Unauthorized')).code).toBe('unauthenticated')
    expect(failureOf(new Error('the command failed')).code).toBe('unavailable')
  })
})

describe('refusalOf', () => {
  it('prefers the host message in a JSON error body', () => {
    const failure = refusalOf({ exitCode: 1, stdout: '{"message":"404 Project Not Found"}', stderr: '' })
    expect(failure).toEqual({ code: 'not-found', message: '404 Project Not Found' })
  })

  it('maps authentication and unavailable refusals', () => {
    expect(refusalOf({ exitCode: 1, stdout: '', stderr: 'Not logged in. Run: gitee auth login' }).code).toBe('unauthenticated')
    expect(refusalOf({ exitCode: 1, stdout: '', stderr: 'HTTP 401: unauthorized' }).code).toBe('unauthenticated')
    expect(refusalOf({ exitCode: 1, stdout: '', stderr: 'something else' }).code).toBe('unavailable')
  })
})

describe('actionFailureOf', () => {
  it('reports a moved head as stale', () => {
    expect(actionFailureOf({ exitCode: 1, stdout: '', stderr: 'head out of date' })).toMatchObject({ code: 'stale' })
    expect(actionFailureOf({ exitCode: 1, stdout: '{"message":"HTTP 409"}', stderr: '' }).code).toBe('stale')
  })

  it('reports missing credentials and other refusals', () => {
    expect(actionFailureOf({ exitCode: 1, stdout: '', stderr: 'Authentication failed (401)' }).code).toBe('unauthenticated')
    expect(actionFailureOf({ exitCode: 1, stdout: '', stderr: 'branch protection' }).code).toBe('failed')
  })
})
