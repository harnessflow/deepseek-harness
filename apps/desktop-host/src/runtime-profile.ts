import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Independent distributions declare their complete dependency graph at the runtime root. */
export function desktopInstallAnchor(runtimeDir: string, bundlePackage?: string): string {
  if (bundlePackage === undefined) return join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  const anchor = join(runtimeDir, 'package.json')
  const manifest = JSON.parse(readFileSync(anchor, 'utf8')) as { dependencies?: Record<string, unknown> }
  if (typeof manifest.dependencies?.[bundlePackage] !== 'string') {
    throw new Error(`desktop runtime: installation manifest omits distribution bundle ${bundlePackage}`)
  }
  return anchor
}
