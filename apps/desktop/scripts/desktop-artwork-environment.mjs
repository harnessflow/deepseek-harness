/** Resolve explicitly supplied standalone artwork without falling back to official branding. */
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { desktopProductEnvironment } from '../src/product.mjs'

/**
 * Resolve the complete desktop artwork input directory.
 * @param {NodeJS.ProcessEnv} environment Distribution build or native development environment.
 * @returns {string | undefined} Standalone artwork directory; undefined for the official distribution.
 */
export function desktopArtworkEnvironment(environment = process.env) {
  if (desktopProductEnvironment(environment) === undefined) return undefined
  const directory = environment.DSH_DESKTOP_PRODUCT_ARTWORK
  if (directory === undefined || !isAbsolute(directory)) throw new Error('desktop product: explicit absolute artwork directory is required')
  for (const name of ['icon-windows.png', 'icon-macos.png', 'tray-windows.ico', 'welcome-brand.svg',
    'brand.png', 'brand-2x.png', 'brand-dark.png', 'brand-dark-2x.png', 'uninstaller-sidebar.png']) {
    if (!existsSync(join(directory, name))) throw new Error(`desktop product: missing artwork ${name}`)
  }
  return directory
}
