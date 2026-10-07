/** Public page-bootstrap options shared by the Host and Client halves. */

import z from '@deepseek-ai/schemastery'

/** Onboarding options after schema defaults are applied. */
export interface Config {
  /** Identifiers leading the display directory; absent retains native order. */
  providerOrder?: string[]
  /** Exact provider identifiers omitted only from directory presentation. */
  hiddenProviders?: string[]
  /** Offer the browser API-key step when no native shell owns credential onboarding. */
  credentialOnboarding: boolean
}

/** Validate Host configuration and its public page-bootstrap payload. */
export const Config: z<Partial<Config>, Config> = z.object({
  providerOrder: z.union([z.array(z.string())]),
  hiddenProviders: z.union([z.array(z.string())]),
  credentialOnboarding: z.boolean().default(true),
})

/** Page-global key carrying only the public onboarding options. */
export const ONBOARDING_CONFIG_GLOBAL = '__DSH_MODELS_ONBOARDING__'
