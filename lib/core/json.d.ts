/** JSON helpers and the mapping from CLI failures to provider-neutral failures. */
import type { ForgeActionFailure, ForgeFailure } from '@deepseek-ai/dsh-experimental-forge';
import type { CliOutput } from './cli.js';
/**
 * Parse a JSON document, tolerating the diagnostics a CLI prints instead.
 * @param text - candidate document.
 * @returns the parsed value, or undefined when the text is not JSON.
 */
export declare function parseJson(text: string): unknown | undefined;
/**
 * Read a JSON value as an object.
 * @param value - candidate value.
 * @returns the value when it is a non-null, non-array object.
 */
export declare function asRecord(value: unknown): Record<string, unknown> | undefined;
/**
 * Whether a value is a provider-neutral failure.
 * @param value - candidate value.
 * @returns whether it carries a string `code` and `message`.
 */
export declare function isFailure(value: unknown): value is ForgeFailure;
/**
 * Read a JSON value as an array.
 * @param value - candidate value.
 * @returns the value when it is an array.
 */
export declare function arrayOf(value: unknown): readonly unknown[] | undefined;
/**
 * Read a JSON member as text.
 * @param value - candidate value.
 * @returns the string, a number rendered as text, or undefined.
 */
export declare function text(value: unknown): string | undefined;
/**
 * Read the first non-empty line of a text.
 * @param value - multi-line text.
 * @returns the trimmed first non-empty line, or null when there is none.
 */
export declare function firstLine(value: string): string | null;
/**
 * Report a runner failure as a provider-neutral failure.
 * @param error - what the runner threw.
 * @returns `too-large` for output over its limit, `unavailable` for a CLI that cannot start or times out, and
 * `unauthenticated` for a message that reports missing or rejected credentials.
 */
export declare function failureOf(error: unknown): ForgeFailure;
/**
 * Report a refused read as a provider-neutral failure.
 * @param output - output of an invocation that exited non-zero.
 * @returns `unauthenticated`, `not-found`, or `unavailable`, with the host's own message.
 */
export declare function refusalOf(output: CliOutput): ForgeFailure;
/**
 * Report a refused write as a provider-neutral action failure.
 * @param output - output of an invocation that exited non-zero.
 * @returns `unauthenticated`, `stale` when the host reports a moved head, or `failed`.
 */
export declare function actionFailureOf(output: CliOutput): ForgeActionFailure;
