/** Workspace picker Host bootstrap; browser navigation owns the configured empty-state behavior. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { Config, WORKSPACE_CONFIG_GLOBAL } from './config.ts'

export { Config } from './config.ts'

/** Publish startup preferences before browser activation.
 * @param ctx - Host bootstrap context.
 * @param config - validated workspace preferences.
 */
export function apply(ctx: Context, config: Config = Config({})): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: WORKSPACE_CONFIG_GLOBAL, value: config })
  })
}
