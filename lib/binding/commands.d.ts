/** Recognition of the three CLIs and the change request URLs their output prints. */
/** Forge family selected by a recognized CLI. */
export type CliName = 'gitlab' | 'gitea' | 'gitee';
/**
 * Identify the CLI a shell command runs.
 * @param command - shell command text.
 * @returns the forge family of `glab`, `gt`, or `gitee`, or undefined for any other command.
 */
export declare function cliOf(command: string): CliName | undefined;
/**
 * Find the HTTP(S) URLs a CLI result prints.
 * @param text - rendered command output.
 * @returns distinct URLs without trailing prose punctuation, in order of first appearance.
 */
export declare function changeRequestUrlsIn(text: string): string[];
/**
 * Read the command string a `bash` tool call runs.
 * @param argumentsValue - parsed tool-call arguments.
 * @returns the command, or undefined when the arguments carry no string `command`.
 */
export declare function commandOf(argumentsValue: unknown): string | undefined;
