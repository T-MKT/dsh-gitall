/** Registers the GitLab, Gitea/Forgejo, and Gitee providers of `ctx.forge`. */
import { startBinding } from './binding/service.js';
import { Config, resolveConfig } from './config.js';
import { createCliRunner } from './core/cli.js';
import { GiteaProvider } from './providers/gitea/provider.js';
import { GiteeProvider } from './providers/gitee/provider.js';
import { GitLabProvider } from './providers/gitlab/provider.js';
export { Config };
export const name = 'gitall';
export const inject = ['forge'];
/**
 * Register one provider per forge, then bind the change request URLs that
 * agent CLI calls print. A CLI that is not installed is not an error here: its
 * provider reports `unavailable` from `readiness` when a Session asks.
 * @param ctx - plugin context with `ctx.forge`.
 * @param config - validated plugin configuration.
 */
export function apply(ctx, config) {
    const resolved = resolveConfig(config);
    const limits = { timeoutMs: resolved.timeoutMs, maxOutputBytes: resolved.maxOutputBytes };
    ctx.forge.register(new GitLabProvider(createCliRunner(resolved.gitlab.command, limits), resolved.gitlab));
    ctx.forge.register(new GiteaProvider(createCliRunner(resolved.gitea.command, limits), resolved.gitea));
    ctx.forge.register(new GiteeProvider(createCliRunner(resolved.gitee.command, limits), resolved.gitee));
    if (resolved.binding)
        startBinding(ctx);
}
