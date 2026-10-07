/** Public workspace startup preference shared by Host and Client. */
import z from '@deepseek-ai/schemastery'

/** Workspace startup options after Loader defaults. */
export interface Config {
  /** Create the native default workspace only when both workspaces and sessions are empty. */
  initializeDefaultOnEmpty: boolean
}

/** Validate the optional startup preference. */
export const Config: z<Partial<Config>, Config> = z.object({
  initializeDefaultOnEmpty: z.boolean().default(true),
})

/** Public bootstrap key; contains no workspace or session data. */
export const WORKSPACE_CONFIG_GLOBAL = '__DSH_WORKSPACE_CONFIG__'
