import { describe, expect, it } from 'vitest'
import { CliOutputLimitError, CliTimeoutError, CliUnavailableError, createCliRunner } from '../../src/core/cli.js'

const limits = { timeoutMs: 5_000, maxOutputBytes: 1_048_576 }

describe('createCliRunner', () => {
  it('returns the exit code and both output streams', async () => {
    const run = createCliRunner(process.execPath, limits)
    const output = await run(['-e', 'process.stdout.write("out"); process.stderr.write("err")'], new AbortController().signal)
    expect(output).toEqual({ exitCode: 0, stdout: 'out', stderr: 'err' })
  })

  it('reports a non-zero exit code instead of throwing', async () => {
    const run = createCliRunner(process.execPath, limits)
    const output = await run(['-e', 'process.exit(3)'], new AbortController().signal)
    expect(output.exitCode).toBe(3)
  })

  it('rejects with CliTimeoutError once the deadline passes', async () => {
    const run = createCliRunner(process.execPath, { timeoutMs: 100, maxOutputBytes: 1_048_576 })
    await expect(run(['-e', 'setTimeout(() => {}, 10000)'], new AbortController().signal)).rejects.toBeInstanceOf(CliTimeoutError)
  })

  it('rejects with CliOutputLimitError when a stream exceeds its bound', async () => {
    const run = createCliRunner(process.execPath, { timeoutMs: 5_000, maxOutputBytes: 128 })
    await expect(run(['-e', 'process.stdout.write("x".repeat(4096))'], new AbortController().signal))
      .rejects.toBeInstanceOf(CliOutputLimitError)
  })

  it('rejects with CliUnavailableError when the executable cannot start', async () => {
    const run = createCliRunner('dsh-gitall-no-such-cli', limits)
    await expect(run([], new AbortController().signal)).rejects.toBeInstanceOf(CliUnavailableError)
  })

  it('rejects with the signal reason when the invocation is cancelled', async () => {
    const run = createCliRunner(process.execPath, limits)
    const controller = new AbortController()
    const reason = new Error('cancelled by test')
    const pending = run(['-e', 'setTimeout(() => {}, 10000)'], controller.signal)
    controller.abort(reason)
    await expect(pending).rejects.toBe(reason)
  })
})
