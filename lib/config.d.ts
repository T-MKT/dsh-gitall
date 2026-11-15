/** Plugin configuration: one CLI command and host list per forge, plus invocation limits. */
import z from '@deepseek-ai/schemastery';
/** The executable and served hosts of one forge. */
export interface ForgeSettings {
    /** CLI executable name or absolute host path. */
    readonly command: string;
    /** Host names this provider serves, such as `gitlab.com` or a self-hosted instance. */
    readonly hosts: readonly string[];
}
/** The fields of one forge that a caller may leave out. */
export interface ForgeSettingsInput {
    /** CLI executable name or absolute host path. */
    command?: string;
    /** Host names this provider serves. */
    hosts?: string[];
}
/** Raw plugin configuration. */
export interface Config {
    /** GitLab CLI and hosts; omitted fields take their defaults. */
    gitlab?: ForgeSettingsInput;
    /** Gitea/Forgejo CLI and hosts; self-hosted instances must be listed here. */
    gitea?: ForgeSettingsInput;
    /** Gitee CLI and hosts. */
    gitee?: ForgeSettingsInput;
    /** Deadline in milliseconds for one CLI invocation. */
    timeoutMs?: number;
    /** Maximum captured bytes per CLI output stream. */
    maxOutputBytes?: number;
    /** Whether agent CLI output binds change requests to the Session. */
    binding?: boolean;
}
/** Configuration with every default applied and every value validated. */
export interface ResolvedConfig {
    readonly gitlab: ForgeSettings;
    readonly gitea: ForgeSettings;
    readonly gitee: ForgeSettings;
    readonly timeoutMs: number;
    readonly maxOutputBytes: number;
    readonly binding: boolean;
}
export declare const Config: z<Config>;
/**
 * Apply defaults and validate raw configuration.
 * @param config - configuration as the plugin loader resolved it.
 * @returns the complete configuration.
 * @throws when a command is empty, a host is malformed, or a numeric limit is not a positive safe integer.
 */
export declare function resolveConfig(config: Config): ResolvedConfig;
