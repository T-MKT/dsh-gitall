/** Recognition of the three CLIs and the change request URLs their output prints. */

/** Forge family selected by a recognized CLI. */
export type CliName = 'gitlab' | 'gitea' | 'gitee'

/** One CLI word at the start of a command, after a separator, or as the whole command. */
const CLI_WORDS: readonly (readonly [RegExp, CliName])[] = [
  [/(?:^|[\s;&|()])glab(?=\s|$)/, 'gitlab'],
  [/(?:^|[\s;&|()])gt(?=\s|$)/, 'gitea'],
  [/(?:^|[\s;&|()])gitee(?=\s|$)/, 'gitee'],
]

/** An HTTP(S) URL in free text. */
const URL = /\bhttps?:\/\/[^\s"'<>`]+/gi

/** Punctuation that prose adds after a URL. */
const TRAILING = /[.,;:!?)\]}'">`]+$/

/**
 * Identify the CLI a shell command runs.
 * @param command - shell command text.
 * @returns the forge family of `glab`, `gt`, or `gitee`, or undefined for any other command.
 */
export function cliOf(command: string): CliName | undefined {
  for (const [pattern, name] of CLI_WORDS) {
    if (pattern.test(command)) return name
  }
  return undefined
}

/**
 * Find the HTTP(S) URLs a CLI result prints.
 * @param text - rendered command output.
 * @returns distinct URLs without trailing prose punctuation, in order of first appearance.
 */
export function changeRequestUrlsIn(text: string): string[] {
  const urls: string[] = []
  for (const match of text.matchAll(URL)) {
    const url = (match[0] ?? '').replace(TRAILING, '').replace(/\/+$/, '')
    if (url.length > 0 && !urls.includes(url)) urls.push(url)
  }
  return urls
}

/**
 * Read the command string a `bash` tool call runs.
 * @param argumentsValue - parsed tool-call arguments.
 * @returns the command, or undefined when the arguments carry no string `command`.
 */
export function commandOf(argumentsValue: unknown): string | undefined {
  if (typeof argumentsValue !== 'object' || argumentsValue === null) return undefined
  const command = (argumentsValue as { command?: unknown }).command
  return typeof command === 'string' ? command : undefined
}
