/** Gitee remote and pull request URL parsing, and validation of the parts inlined into requests. */

import type { ChangeRequestRef, ForgeRepository } from '@deepseek-ai/dsh-experimental-forge'

/** Characters Gitee permits in one owner or repository name. */
const SEGMENT = /^[A-Za-z0-9_.-]+$/

/** A full SHA-1 or SHA-256 object name. */
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i

/** Host, owner, and repository name addressed by a URL. */
export interface GiteeLocation {
  /** Lowercase host name, with its HTTP port when the URL carries one. */
  readonly host: string
  /** Owner as the URL spells it. */
  readonly owner: string
  /** Repository name without a `.git` suffix. */
  readonly name: string
}

/**
 * Check one owner or repository name segment.
 * @param value - candidate segment.
 * @returns whether Gitee permits the segment and it is not a dot path.
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
 * Validate a pull request before its owner, name, and number are inlined into an API path.
 * @param ref - pull request on a Gitee host.
 * @returns its repository.
 * @throws when a path segment or the number is invalid.
 */
export function checkedRepository(ref: ChangeRequestRef): ForgeRepository {
  const { owner, name } = ref.repository
  if (!isSegment(owner) || !isSegment(name)) throw new Error(`gitall: invalid repository ${JSON.stringify(`${owner}/${name}`)}`)
  if (!Number.isSafeInteger(ref.number) || ref.number <= 0) throw new Error(`gitall: invalid pull request number ${ref.number}`)
  return ref.repository
}

/**
 * Parse a Git remote URL. Accepts `http(s)://[user@]host[:port]/owner/name`,
 * `ssh://[user@]host[:port]/owner/name`, `git://host/owner/name`, and the scp-like
 * `[user@]host:owner/name`, each with an optional `.git` suffix or trailing slash.
 * HTTP(S) ports belong to the host identity; SSH and Git transport ports do not.
 * @param url - fetch or push URL as Git reports it.
 * @returns the location, or undefined for other URL shapes.
 */
export function parseRemoteUrl(url: string): GiteeLocation | undefined {
  const trimmed = url.trim()
  const scheme = /^https?:\/\/(?:[^@/]+@)?([^/:]+(?::\d+)?)\/(.+)$/i.exec(trimmed)
    ?? /^(?:ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(trimmed)
  const scp = scheme === null ? /^(?:[^@/:]+@)?([^/:]+):(?!\/\/)(.+)$/.exec(trimmed) : null
  const match = scheme ?? scp
  if (match === null) return undefined
  const [, host = '', path = ''] = match
  const parts = path.replace(/\/+$/, '').replace(/\.git$/i, '').split('/')
  if (parts.length !== 2 || !parts.every(isSegment)) return undefined
  const [owner = '', name = ''] = parts
  return { host: host.toLowerCase(), owner, name }
}

/**
 * Parse a pull request web URL such as `https://gitee.com/owner/name/pulls/12/files`.
 * @param url - web URL of a pull request.
 * @returns the location and number, or undefined for other URLs.
 */
export function parsePullRequestUrl(url: string): (GiteeLocation & { readonly number: number }) | undefined {
  const match = /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pulls\/(\d+)(?:[/?#].*)?$/i.exec(url.trim())
  if (match === null) return undefined
  const [, host = '', owner = '', name = '', digits = ''] = match
  const number = Number(digits)
  if (!isSegment(owner) || !isSegment(name) || !Number.isSafeInteger(number) || number <= 0) return undefined
  return { host: host.toLowerCase(), owner, name, number }
}
