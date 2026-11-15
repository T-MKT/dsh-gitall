/** Runs a vendor CLI on the host with a scrubbed, non-interactive environment. */
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess';
import { execa } from 'execa';
/** Thrown when the executable cannot start, for example because it is not installed. */
export class CliUnavailableError extends Error {
    name = 'CliUnavailableError';
}
/** Thrown when one invocation outlives `timeoutMs`; the process is killed. */
export class CliTimeoutError extends Error {
    name = 'CliTimeoutError';
}
/** Thrown when an output stream exceeds `maxOutputBytes`; the process is killed. */
export class CliOutputLimitError extends Error {
    name = 'CliOutputLimitError';
}
/**
 * Environment that keeps every vendor CLI machine-readable and silent: no
 * colors, no pager, no update notice, and JSON errors from `gt`. Secret-like
 * variables never reach the child, so each CLI authenticates from its own
 * credential store.
 */
function cliEnv() {
    return {
        ...scrubbedParentEnv(),
        NO_COLOR: '1',
        CLICOLOR: '0',
        TERM: 'dumb',
        GITEA_CLI_ERROR_FORMAT: 'json',
        GITEA_CLI_NO_UPDATE_NOTIFIER: '1',
    };
}
/**
 * Build a runner for one CLI executable. The child inherits the scrubbed parent
 * environment, so variables whose names contain KEY, PASSWORD, SECRET, or TOKEN
 * never reach it.
 * @param command - executable name or absolute host path.
 * @param limits - deadline and captured output bound.
 * @returns the runner.
 */
export function createCliRunner(command, limits) {
    return async (args, signal, input) => {
        const result = await execa(command, args, {
            env: cliEnv(),
            extendEnv: false,
            ...input === undefined ? { stdin: 'ignore' } : { input },
            reject: false,
            timeout: limits.timeoutMs,
            cancelSignal: signal,
            maxBuffer: limits.maxOutputBytes,
        });
        const shown = [command, ...args.slice(0, 1)].join(' ');
        if (result.isCanceled)
            throw signal.reason;
        if (result.timedOut)
            throw new CliTimeoutError(`${shown} timed out after ${limits.timeoutMs}ms`);
        if (result.isMaxBuffer)
            throw new CliOutputLimitError(`${shown} output exceeds maxOutputBytes`);
        // A result without an exit code failed before the process ran; execa then always sets shortMessage.
        if (result.exitCode === undefined)
            throw new CliUnavailableError(`${command} could not start: ${String(result.shortMessage)}`);
        return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
    };
}
