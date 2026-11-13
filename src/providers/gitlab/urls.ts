/** GitLab remote and merge request URL parsing, and validation of the parts inlined into requests. */

import type { ChangeRequestRef, ForgeRepository } from '@deepseek-ai/dsh-experimental-forge'

/** Characters GitLab permits in one namespace or project path segment. */
const SEGMENT = /^[A-Za-z0-9_.-]+$/

/** A full SHA-1 or SHA-256 object name. */
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i

/** Host and project path addressed by a URL. */
export interface GitLabLocation {
  /** Lowercase host name, with its HTTP port when the URL carries one. */
  readonly host: string
  /** Namespace path, possibly several segments deep. */
  readonly owner: string
  /** Project name without a `.git` suffix. */
  readonly name: string
}

/**
 * Check one namespace or project path segment.
 * @param value - candidate segment.
 * @returns whether GitLab permits the segment and it is not a dot path.
 */
export function isSegment(value: string): boolean {
  return SEGMENT.test(value) && value !== '.' && value !== '..'
}

/**
 * Whether a value is a full commit object name.
 * @param value - candidate commit.
 * @returns whether it is 40 or 64 hexadecimal digits.
 */
export function isCommit(value: string): boolean {
  return COMMIT.test(value)
}

/**
 * Validate a merge request before its project path and number are inlined into an API path.
 * @param ref - merge request on a GitLab host.
 * @returns its repository.
 * @throws when a path segment or the number is invalid.
 */
export function checkedRepository(ref: ChangeRequestRef): ForgeRepository {
  const { owner, name } = ref.repository
  if (!owner.split('/').every(isSegment) || !isSegment(name)) {
    throw new Error(`gitall: invalid repository ${JSON.stringify(`${owner}/${name}`)}`)
  }
  if (!Number.isSafeInteger(ref.number) || ref.number <= 0) throw new Error(`gitall: invalid merge request number ${ref.number}`)
  return ref.repository
}

/**
 * Parse a Git remote URL. Accepts `http(s)://[user@]host[:port]/group/.../project`,
 * `ssh://[user@]host[:port]/group/.../project`, `git://host/group/.../project`, and the scp-like
 * `[user@]host:group/.../project`, each with an optional `.git` suffix or trailing slash.
 * HTTP(S) ports belong to the host identity; SSH and Git transport ports do not.
 * @param url - fetch or push URL as Git reports it.
 * @returns the location, or undefined for other URL shapes.
 */
export function parseRemoteUrl(url: string): GitLabLocation | undefined {
  const trimmed = url.trim()
  const scheme = /^https?:\/\/(?:[^@/]+@)?([^/:]+(?::\d+)?)\/(.+)$/i.exec(trimmed)
    ?? /^(?:ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(trimmed)
  const scp = scheme === null ? /^(?:[^@/:]+@)?([^/:]+):(?!\/\/)(.+)$/.exec(trimmed) : null
  const match = scheme ?? scp
  if (match === null) return undefined
  const [, host = '', path = ''] = match
  const parts = path.replace(/\/+$/, '').replace(/\.git$/i, '').split('/')
  if (parts.length < 2 || !parts.every(isSegment)) return undefined
  const name = parts[parts.length - 1] ?? ''
  return { host: host.toLowerCase(), owner: parts.slice(0, -1).join('/'), name }
}

/**
 * Parse a merge request web URL such as `https://gitlab.com/group/project/-/merge_requests/12/diffs`.
 * The legacy `.../project/merge_requests/12` shape is accepted too.
 * @param url - web URL of a merge request.
 * @returns the location and number, or undefined for other URLs.
 */
export function parseMergeRequestUrl(url: string): (GitLabLocation & { readonly number: number }) | undefined {
  const match = /^https?:\/\/([^/]+)\/(.+?)\/(?:-\/)?merge_requests\/(\d+)(?:[/?#].*)?$/i.exec(url.trim())
  if (match === null) return undefined
  const [, host = '', path = '', digits = ''] = match
  const number = Number(digits)
  const parts = path.split('/')
  if (parts.length < 2 || !parts.every(isSegment) || !Number.isSafeInteger(number) || number <= 0) return undefined
  return { host: host.toLowerCase(), owner: parts.slice(0, -1).join('/'), name: parts[parts.length - 1] ?? '', number }
}
