/** Registers the GitLab, Gitea/Forgejo, and Gitee providers of `ctx.forge`. */
import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.js';
export { Config };
export declare const name = "gitall";
export declare const inject: string[];
/**
 * Register one provider per forge, then bind the change request URLs that
 * agent CLI calls print. A CLI that is not installed is not an error here: its
 * provider reports `unavailable` from `readiness` when a Session asks.
 * @param ctx - plugin context with `ctx.forge`.
 * @param config - validated plugin configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
