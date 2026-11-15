/** Binds the change requests that agent CLI calls print to their Session. */
import type { Context } from '@deepseek-ai/cordis';
/**
 * Append a `reference` binding record for each change request URL a `glab`,
 * `gt`, or `gitee` call prints, once per Session and URL. The handler is
 * synchronous, so the record joins the log before the turn continues.
 * @param ctx - plugin context with `forge`; the binding starts when `tools` appears.
 */
export declare function startBinding(ctx: Context): void;
