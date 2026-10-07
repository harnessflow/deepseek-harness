/** Host registration for browser conversation preferences. */
import type {} from '@deepseek-ai/dsh-settings'

import type { Volatile, Context } from '@deepseek-ai/cordis'
import type { BusyEnterBehavior } from './submission-settings.ts'
import z from '@deepseek-ai/schemastery'

import { ConversationSettingsFields } from './submission-settings.ts'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { HeroConfig, HERO_CONFIG_GLOBAL } from './hero-config.ts'

export {
  BUSY_ENTER_BEHAVIORS, BUSY_ENTER_FIELD, CONVERSATION_SETTINGS_NAMESPACE,
  DEFAULT_BUSY_ENTER_BEHAVIOR, type BusyEnterBehavior, type ConversationSettings,
} from './submission-settings.ts'

/** Runtime preferences projected to the browser. */
export interface Config {
  /** Optional localized hero presentation; absent retains native copy and badge. */
  hero?: HeroConfig
  /** Enter key behavior while a turn is running. */
  busyEnter: Volatile<BusyEnterBehavior>
}

/** Live preferences projected to the browser. */
export const Config = z.object({
  hero: z.union([HeroConfig]),
  busyEnter: ConversationSettingsFields.busyEnter.volatile(),
})

/** Host preferences are consumed through the configuration form projection.
 * @param ctx Plugin context used for optional settings presentation.
 * @param config Validated browser preferences; absent hero fields retain native presentation.
 */
export function apply(ctx: Context, config: Config = Config({})): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: HERO_CONFIG_GLOBAL, value: config.hero ?? {} })
  })
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
