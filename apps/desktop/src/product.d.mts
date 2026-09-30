import type { DesktopProduct } from './product-types.ts'

/** Optional standalone distribution identity; absent metadata preserves official defaults. */
export function parseDesktopProduct(value: unknown): DesktopProduct | undefined
/** Read and validate explicit deployment metadata. */
export function desktopProductEnvironment(environment?: NodeJS.ProcessEnv): DesktopProduct | undefined
/** Private state resolved before Electron or Desktop Host opens storage. */
export function desktopProductPaths(product: DesktopProduct, userHome: string, environment: NodeJS.ProcessEnv, packaged: boolean): {
  home: string; agents: string; userData: string; sessionData: string; logs: string
}
