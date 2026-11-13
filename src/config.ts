/** Plugin configuration: one CLI command and host list per forge, plus invocation limits. */

import z from '@deepseek-ai/schemastery'

/** Largest delay `setTimeout` accepts. */
const MAX_TIMER_DELAY_MS = 2_147_483_647

/** Characters a host name may contain, with an optional port. */
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d+)?$/i

/** The executable and served hosts of one forge. */
export interface ForgeSettings {
  /** CLI executable name or absolute host path. */
  readonly command: string
  /** Host names this provider serves, such as `gitlab.com` or a self-hosted instance. */
  readonly hosts: readonly string[]
}

/** The fields of one forge that a caller may leave out. */
export interface ForgeSettingsInput {
  /** CLI executable name or absolute host path. */
  command?: string
  /** Host names this provider serves. */
  hosts?: string[]
}

/** Raw plugin configuration. */
export interface Config {
  /** GitLab CLI and hosts; omitted fields take their defaults. */
  gitlab?: ForgeSettingsInput
  /** Gitea/Forgejo CLI and hosts; self-hosted instances must be listed here. */
  gitea?: ForgeSettingsInput
  /** Gitee CLI and hosts. */
  gitee?: ForgeSettingsInput
  /** Deadline in milliseconds for one CLI invocation. */
  timeoutMs?: number
  /** Maximum captured bytes per CLI output stream. */
  maxOutputBytes?: number
  /** Whether agent CLI output binds change requests to the Session. */
  binding?: boolean
}

/** Configuration with every default applied and every value validated. */
export interface ResolvedConfig {
  readonly gitlab: ForgeSettings
  readonly gitea: ForgeSettings
  readonly gitee: ForgeSettings
  readonly timeoutMs: number
  readonly maxOutputBytes: number
  readonly binding: boolean
}

export const Config: z<Config> = z.object({
  gitlab: z.object({
    command: z.string().description('GitLab CLI executable, such as glab.'),
    hosts: z.array(z.string()).description('GitLab hosts this provider serves, such as gitlab.com.'),
  }).description('GitLab CLI and hosts.'),
  gitea: z.object({
    command: z.string().description('Gitea CLI executable, such as gt.'),
    hosts: z.array(z.string()).description('Gitea hosts this provider serves; self-hosted instances must be listed.'),
  }).description('Gitea/Forgejo CLI and hosts.'),
  gitee: z.object({
    command: z.string().description('Gitee CLI executable, such as gitee.'),
    hosts: z.array(z.string()).description('Gitee hosts this provider serves, such as gitee.com.'),
  }).description('Gitee CLI and hosts.'),
  timeoutMs: z.number().default(30_000).description('Deadline in milliseconds for one CLI invocation.'),
  maxOutputBytes: z.number().default(8_388_608).description('Maximum captured bytes per CLI output stream.'),
  binding: z.boolean().default(true).description('Bind change request URLs printed by agent CLI calls to the Session.'),
})

/**
 * Apply defaults and validate raw configuration.
 * @param config - configuration as the plugin loader resolved it.
 * @returns the complete configuration.
 * @throws when a command is empty, a host is malformed, or a numeric limit is not a positive safe integer.
 */
export function resolveConfig(config: Config): ResolvedConfig {
  return {
    gitlab: settingsOf('gitlab', config.gitlab, 'glab', ['gitlab.com']),
    gitea: settingsOf('gitea', config.gitea, 'gt', []),
    gitee: settingsOf('gitee', config.gitee, 'gitee', ['gitee.com']),
    timeoutMs: limitOf('timeoutMs', config.timeoutMs ?? 30_000, MAX_TIMER_DELAY_MS),
    maxOutputBytes: limitOf('maxOutputBytes', config.maxOutputBytes ?? 8_388_608, Number.MAX_SAFE_INTEGER),
    binding: config.binding ?? true,
  }
}

function settingsOf(forge: string, given: ForgeSettingsInput | undefined, command: string, hosts: readonly string[]): ForgeSettings {
  const executable = (given?.command ?? command).trim()
  if (executable.length === 0) throw new Error(`gitall: ${forge}.command must not be empty`)
  const served = given?.hosts ?? hosts
  for (const host of served) {
    if (!HOST.test(host)) throw new Error(`gitall: invalid host ${JSON.stringify(host)} in ${forge}.hosts`)
  }
  return { command: executable, hosts: served.map(host => host.toLowerCase()) }
}

function limitOf(key: string, value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`gitall: ${key} must be a positive integer no greater than ${maximum}`)
  }
  return value
}
