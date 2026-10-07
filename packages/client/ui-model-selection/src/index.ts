/** Host bootstrap for the browser's display-only provider directory policy. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { Config, MODEL_PRESENTATION_GLOBAL } from './presentation.ts'

export { Config } from './presentation.ts'

/** Publish display-only provider policy before browser activation.
 * @param ctx - Host bootstrap context.
 * @param config - validated display options.
 */
export function apply(ctx: Context, config: Config = Config({})): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: MODEL_PRESENTATION_GLOBAL, value: config })
  })
}
