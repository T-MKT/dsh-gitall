/** Gitee remote and pull request URL parsing, and validation of the parts inlined into requests. */
import type { ChangeRequestRef, ForgeRepository } from '@deepseek-ai/dsh-experimental-forge';
/** Host, owner, and repository name addressed by a URL. */
export interface GiteeLocation {
    /** Lowercase host name, with its HTTP port when the URL carries one. */
    readonly host: string;
    /** Owner as the URL spells it. */
    readonly owner: string;
    /** Repository name without a `.git` suffix. */
    readonly name: string;
}
/**
 * Check one owner or repository name segment.
 * @param value - candidate segment.
 * @returns whether Gitee permits the segment and it is not a dot path.
 */
export declare function isSegment(value: string): boolean;
/**
 * Whether a value is a full commit object name.
 * @param value - candidate commit.
 * @returns whether it is 40 or 64 hexadecimal digits.
 */
export declare function isCommit(value: string): boolean;
/**
 * Validate a pull request before its owner, name, and number are inlined into an API path.
 * @param ref - pull request on a Gitee host.
 * @returns its repository.
 * @throws when a path segment or the number is invalid.
 */
export declare function checkedRepository(ref: ChangeRequestRef): ForgeRepository;
/**
 * Parse a Git remote URL. Accepts `http(s)://[user@]host[:port]/owner/name`,
 * `ssh://[user@]host[:port]/owner/name`, `git://host/owner/name`, and the scp-like
 * `[user@]host:owner/name`, each with an optional `.git` suffix or trailing slash.
 * HTTP(S) ports belong to the host identity; SSH and Git transport ports do not.
 * @param url - fetch or push URL as Git reports it.
 * @returns the location, or undefined for other URL shapes.
 */
export declare function parseRemoteUrl(url: string): GiteeLocation | undefined;
/**
 * Parse a pull request web URL such as `https://gitee.com/owner/name/pulls/12/files`.
 * @param url - web URL of a pull request.
 * @returns the location and number, or undefined for other URLs.
 */
export declare function parsePullRequestUrl(url: string): (GiteeLocation & {
    readonly number: number;
}) | undefined;
