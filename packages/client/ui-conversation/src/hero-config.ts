/** Optional localized hero preferences shared by Host bootstrap and browser assembly. */
import z from '@deepseek-ai/schemastery'
import type { LocalizedText } from '@deepseek-ai/dsh-package-manifest'

/** Hero copy and badge preferences; omission preserves native presentation. */
export interface HeroConfig {
  /** Localized empty-state headline; absent uses the native locale dictionary. */
  headline?: LocalizedText
  /** Localized directory guidance before a Session is selected. */
  workspacePlaceholder?: LocalizedText
  /** Show the existing preview label; absent retains the native visible badge. */
  showPreviewBadge?: boolean
}

const localizedText: z<LocalizedText> = z.union([
  z.string(), z.intersect([z.dict(z.string()), z.object({ en: z.string().required() })]),
])

/** Validate localized values and optional badge policy. */
export const HeroConfig: z<HeroConfig> = z.object({
  headline: localizedText,
  workspacePlaceholder: localizedText,
  showPreviewBadge: z.boolean(),
})

/** Public bootstrap key containing only hero preferences. */
export const HERO_CONFIG_GLOBAL = '__DSH_CONVERSATION_HERO__'
