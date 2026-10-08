/** Public workspace startup preference shared by Host and Client. */
import z from '@deepseek-ai/schemastery'

/** Workspace startup options after Loader defaults. */
export interface Config {
  /** Create the native default workspace only when both workspaces and sessions are empty. */
  initializeDefaultOnEmpty: boolean
  /** Global New Session clears selection until the user chooses a Workspace. */
  requireWorkspaceSelectionOnNewSession: boolean
}

/** Validate the optional startup preference. */
export const Config: z<Partial<Config>, Config> = z.object({
  initializeDefaultOnEmpty: z.boolean().default(true),
  requireWorkspaceSelectionOnNewSession: z.boolean().default(false),
})

/** Public bootstrap key; contains no workspace or session data. */
export const WORKSPACE_CONFIG_GLOBAL = '__DSH_WORKSPACE_CONFIG__'
