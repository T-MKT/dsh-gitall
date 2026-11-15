/** JSON helpers and the mapping from CLI failures to provider-neutral failures. */
import { CliOutputLimitError, CliTimeoutError, CliUnavailableError } from './cli.js';
/** Wording with which a host or CLI reports missing or rejected credentials. */
const AUTHENTICATION = /not logged in|not signed in|no account|authentication|unauthorized|bad credentials|invalid (?:token|credential)|HTTP 401|\b401\b/i;
/** Wording with which a host reports that the named resource does not exist. */
const NOT_FOUND = /HTTP 404|\(404\)|\b404 Not Found\b|not found|does not exist/i;
/** Wording with which a host reports that the head moved past the confirmed commit. */
const STALE = /HTTP 409|\(409\)|head out of date|head (?:commit )?(?:does not match|mismatch)|sha (?:does not match|mismatch)/i;
/**
 * Parse a JSON document, tolerating the diagnostics a CLI prints instead.
 * @param text - candidate document.
 * @returns the parsed value, or undefined when the text is not JSON.
 */
export function parseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch (error) {
        void error; // A CLI prints diagnostics instead of JSON when a request fails before the host answers.
        return undefined;
    }
}
/**
 * Read a JSON value as an object.
 * @param value - candidate value.
 * @returns the value when it is a non-null, non-array object.
 */
export function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}
/**
 * Whether a value is a provider-neutral failure.
 * @param value - candidate value.
 * @returns whether it carries a string `code` and `message`.
 */
export function isFailure(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const record = value;
    return typeof record.code === 'string' && typeof record.message === 'string';
}
/**
 * Read a JSON value as an array.
 * @param value - candidate value.
 * @returns the value when it is an array.
 */
export function arrayOf(value) {
    return Array.isArray(value) ? value : undefined;
}
/**
 * Read a JSON member as text.
 * @param value - candidate value.
 * @returns the string, a number rendered as text, or undefined.
 */
export function text(value) {
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    return undefined;
}
/**
 * Read the first non-empty line of a text.
 * @param value - multi-line text.
 * @returns the trimmed first non-empty line, or null when there is none.
 */
export function firstLine(value) {
    return value.split('\n').map(line => line.trim()).find(line => line.length > 0) ?? null;
}
/**
 * Report a runner failure as a provider-neutral failure.
 * @param error - what the runner threw.
 * @returns `too-large` for output over its limit, `unavailable` for a CLI that cannot start or times out, and
 * `unauthenticated` for a message that reports missing or rejected credentials.
 */
export function failureOf(error) {
    if (error instanceof CliOutputLimitError)
        return { code: 'too-large', message: error.message };
    if (error instanceof CliTimeoutError || error instanceof CliUnavailableError)
        return { code: 'unavailable', message: error.message };
    const message = error instanceof Error ? error.message : String(error);
    return { code: AUTHENTICATION.test(message) ? 'unauthenticated' : 'unavailable', message };
}
/**
 * Report a refused read as a provider-neutral failure.
 * @param output - output of an invocation that exited non-zero.
 * @returns `unauthenticated`, `not-found`, or `unavailable`, with the host's own message.
 */
export function refusalOf(output) {
    const message = refusalMessage(output);
    if (AUTHENTICATION.test(message))
        return { code: 'unauthenticated', message };
    if (NOT_FOUND.test(message))
        return { code: 'not-found', message };
    return { code: 'unavailable', message };
}
/**
 * Report a refused write as a provider-neutral action failure.
 * @param output - output of an invocation that exited non-zero.
 * @returns `unauthenticated`, `stale` when the host reports a moved head, or `failed`.
 */
export function actionFailureOf(output) {
    const message = refusalMessage(output);
    if (AUTHENTICATION.test(message))
        return { code: 'unauthenticated', message };
    if (STALE.test(message))
        return { code: 'stale', message };
    return { code: 'failed', message };
}
/** The host's message from the error body, else the first diagnostic line, else the exit code. */
function refusalMessage(output) {
    for (const candidate of [output.stdout, firstLine(output.stderr) ?? '']) {
        const fromBody = errorMessageOf(parseJson(candidate));
        if (fromBody !== undefined)
            return fromBody;
    }
    return firstLine(output.stderr) ?? firstLine(output.stdout) ?? `the command exited with ${output.exitCode}`;
}
/** The message a JSON error body carries, under any of the field names the three hosts use. */
function errorMessageOf(body) {
    const record = asRecord(body);
    if (record === undefined)
        return undefined;
    for (const key of ['message', 'error', 'error_description']) {
        const value = text(record[key]);
        if (value !== undefined && value.trim().length > 0)
            return value;
    }
    for (const key of ['messages', 'errors']) {
        const entries = arrayOf(record[key]);
        const first = entries?.[0];
        const value = text(first) ?? text(asRecord(first)?.message);
        if (value !== undefined && value.trim().length > 0)
            return value;
    }
    return undefined;
}
