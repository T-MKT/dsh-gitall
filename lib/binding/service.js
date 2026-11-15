/** Binds the change requests that agent CLI calls print to their Session. */
import { appendPluginRecord } from '@deepseek-ai/dsh-session';
import { changeRequestUrlsIn, cliOf, commandOf } from './commands.js';
/** Plugin record the forge-session projection folds into the bindings of a Session. */
const BINDING_RECORD = 'plugin:forge-session/binding';
/**
 * Append a `reference` binding record for each change request URL a `glab`,
 * `gt`, or `gitee` call prints, once per Session and URL. The handler is
 * synchronous, so the record joins the log before the turn continues.
 * @param ctx - plugin context with `forge`; the binding starts when `tools` appears.
 */
export function startBinding(ctx) {
    const recorded = new WeakMap();
    ctx.inject(['tools'], scope => {
        scope.on('tools/result', (exec, result) => {
            if (exec.name !== 'bash' || exec.agent === undefined || exec.parent !== undefined || result.isError)
                return;
            const command = commandOf(exec.arguments);
            if (command === undefined || cliOf(command) === undefined)
                return;
            const agent = exec.agent;
            const output = result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n');
            let seen = recorded.get(agent.session);
            for (const url of changeRequestUrlsIn(output)) {
                const ref = ctx.forge.changeRequestFromUrl(url);
                if (ref === undefined)
                    continue;
                const canonical = ctx.forge.changeRequestUrl(ref);
                seen ??= new Set();
                if (seen.has(canonical))
                    continue;
                seen.add(canonical);
                recorded.set(agent.session, seen);
                try {
                    appendPluginRecord(agent.session, BINDING_RECORD, { action: 'reference', url: canonical });
                }
                catch (error) {
                    scope.logger.warn(`gitall: could not bind ${canonical}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        });
    });
}
