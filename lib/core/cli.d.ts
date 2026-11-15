/** Runs a vendor CLI on the host with a scrubbed, non-interactive environment. */
/** Complete output of one invocation that ran to an exit code. */
export interface CliOutput {
    /** Process exit code. */
    readonly exitCode: number;
    /** Standard output without its final newline. */
    readonly stdout: string;
    /** Standard error without its final newline. */
    readonly stderr: string;
}
/** Runs one CLI with literal arguments; rejects when the process cannot run to an exit code. */
export type CliRunner = (args: readonly string[], signal: AbortSignal, input?: string) => Promise<CliOutput>;
/** Resolved executable and invocation limits. */
export interface CliLimits {
    /** Deadline in milliseconds for one invocation. */
    readonly timeoutMs: number;
    /** Maximum captured bytes per output stream. */
    readonly maxOutputBytes: number;
}
/** Thrown when the executable cannot start, for example because it is not installed. */
export declare class CliUnavailableError extends Error {
    name: string;
}
/** Thrown when one invocation outlives `timeoutMs`; the process is killed. */
export declare class CliTimeoutError extends Error {
    name: string;
}
/** Thrown when an output stream exceeds `maxOutputBytes`; the process is killed. */
export declare class CliOutputLimitError extends Error {
    name: string;
}
/**
 * Build a runner for one CLI executable. The child inherits the scrubbed parent
 * environment, so variables whose names contain KEY, PASSWORD, SECRET, or TOKEN
 * never reach it.
 * @param command - executable name or absolute host path.
 * @param limits - deadline and captured output bound.
 * @returns the runner.
 */
export declare function createCliRunner(command: string, limits: CliLimits): CliRunner;
