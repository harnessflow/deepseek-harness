/** Model provider presentation policy; never mutates the execution catalog. */
import z from '@deepseek-ai/schemastery'
import { presentEntries } from '@deepseek-ai/dsh-util-values'

/** Optional display ordering and exact provider identifiers to omit from selectable directories. */
export interface ProviderPresentation {
  /** Listed identifiers lead other providers in this order; absent preserves each surface's native order. */
  providerOrder?: string[]
  /** Exact identifiers omitted only from selectable presentation. */
  hiddenProviders?: string[]
}

/** Shared configuration fields for model selection and model settings. */
export const providerPresentationFields = {
  providerOrder: z.union([z.array(z.string())]),
  hiddenProviders: z.union([z.array(z.string())]),
}

/** Validates presentation options without inventing a default model selection. */
export const Config: z<ProviderPresentation> = z.object(providerPresentationFields)
/** Selector configuration is exclusively presentation policy. */
export type Config = ProviderPresentation

/** Public bootstrap key for selector presentation. */
export const MODEL_PRESENTATION_GLOBAL = '__DSH_MODEL_PRESENTATION__'

/** Filter and stably order a display-only provider directory.
 * @param entries - complete directory; left unchanged.
 * @param identify - exact provider identifier for each entry.
 * @param policy - display configuration.
 * @param nativeOrder - native ordering used only when providerOrder is absent.
 * @returns visible entries without changing their data or execution identity.
 */
export function presentProviders<T>(
  entries: readonly T[], identify: (entry: T) => string, policy: ProviderPresentation,
  nativeOrder: readonly string[] = [],
): T[] {
  return presentEntries(entries, identify, policy.providerOrder ?? nativeOrder, policy.hiddenProviders)
}
