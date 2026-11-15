/** GitLab remote and merge request URL parsing, and validation of the parts inlined into requests. */
import type { ChangeRequestRef, ForgeRepository } from '@deepseek-ai/dsh-experimental-forge';
/** Host and project path addressed by a URL. */
export interface GitLabLocation {
    /** Lowercase host name, with its HTTP port when the URL carries one. */
    readonly host: string;
    /** Namespace path, possibly several segments deep. */
    readonly owner: string;
    /** Project name without a `.git` suffix. */
    readonly name: string;
}
/**
 * Check one namespace or project path segment.
 * @param value - candidate segment.
 * @returns whether GitLab permits the segment and it is not a dot path.
 */
export declare function isSegment(value: string): boolean;
/**
 * Whether a value is a full commit object name.
 * @param value - candidate commit.
 * @returns whether it is 40 or 64 hexadecimal digits.
 */
export declare function isCommit(value: string): boolean;
/**
 * Validate a merge request before its project path and number are inlined into an API path.
 * @param ref - merge request on a GitLab host.
 * @returns its repository.
 * @throws when a path segment or the number is invalid.
 */
export declare function checkedRepository(ref: ChangeRequestRef): ForgeRepository;
/**
 * Parse a Git remote URL. Accepts `http(s)://[user@]host[:port]/group/.../project`,
 * `ssh://[user@]host[:port]/group/.../project`, `git://host/group/.../project`, and the scp-like
 * `[user@]host:group/.../project`, each with an optional `.git` suffix or trailing slash.
 * HTTP(S) ports belong to the host identity; SSH and Git transport ports do not.
 * @param url - fetch or push URL as Git reports it.
 * @returns the location, or undefined for other URL shapes.
 */
export declare function parseRemoteUrl(url: string): GitLabLocation | undefined;
/**
 * Parse a merge request web URL such as `https://gitlab.com/group/project/-/merge_requests/12/diffs`.
 * The legacy `.../project/merge_requests/12` shape is accepted too.
 * @param url - web URL of a merge request.
 * @returns the location and number, or undefined for other URLs.
 */
export declare function parseMergeRequestUrl(url: string): (GitLabLocation & {
    readonly number: number;
}) | undefined;
