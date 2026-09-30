/** Optional standalone distribution identity shared by the native shell and builder. */
import { existsSync, realpathSync, lstatSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { valid } from 'semver'

/**
 * Validate a distribution record; omission retains the official Desktop behavior.
 * @param {unknown} value File or environment JSON.
 * @returns {import('./product-types.js').DesktopProduct | undefined} Normalized standalone identity.
 */
export function parseDesktopProduct(value) {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('desktop product: expected an object')
  const segment = /^[a-zA-Z0-9._-]+$/u
  const packageName = /^@[a-z0-9._-]+\/[a-z0-9._-]+$/u
  const text = (key, pattern) => {
    const item = value[key]
    if (typeof item !== 'string' || !item || (pattern && !pattern.test(item))) throw new Error(`desktop product: invalid ${key}`)
    return item
  }
  const product = {
    name: text('name'), version: text('version'), appId: text('appId', /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/u),
    packageName: text('packageName', packageName), artifactPrefix: text('artifactPrefix', segment),
    protocol: text('protocol', /^[a-z][a-z0-9-]*$/u), homeDirectory: text('homeDirectory', segment),
    agentsDirectory: text('agentsDirectory', segment), bundlePackage: text('bundlePackage', packageName), updateMode: value.updateMode,
  }
  if (valid(product.version) === null || product.updateMode !== 'manual'
    || product.name === 'DeepSeek Harness' || product.appId.startsWith('com.deepseek.')
    || product.packageName.startsWith('@deepseek-ai/') || product.bundlePackage.startsWith('@deepseek-ai/')
    || ['dsh', 'dsh-app'].includes(product.protocol) || ['.', '..', '.dsh', '.agents'].includes(product.homeDirectory)
    || ['.', '..'].includes(product.agentsDirectory) || /[\x00-\x1f/\\]/u.test(product.name)) {
    throw new Error('desktop product: standalone identity must not reuse official state or updates')
  }
  return Object.freeze(product)
}

/**
 * Read the optional distribution JSON supplied by the supported deployment launcher.
 * @param {NodeJS.ProcessEnv} environment Launcher environment.
 * @returns {import('./product-types.js').DesktopProduct | undefined} Validated identity.
 */
export function desktopProductEnvironment(environment = process.env) {
  if (environment.DSH_DESKTOP_PRODUCT === undefined) return undefined
  let value
  try { value = JSON.parse(environment.DSH_DESKTOP_PRODUCT) }
  catch { throw new Error('desktop product: DSH_DESKTOP_PRODUCT must be JSON') }
  return parseDesktopProduct(value)
}

function canonical(path) {
  let current = resolve(path)
  const suffix = []
  while (!existsSync(current)) {
    // A dangling link is not a new directory owned by this application.
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('desktop product: dangling state link') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    const parent = dirname(current)
    if (parent === current) throw new Error('desktop product: state has no existing ancestor')
    suffix.unshift(basename(current))
    current = parent
  }
  if (!lstatSync(realpathSync(current)).isDirectory()) throw new Error('desktop product: state ancestor is not a directory')
  return join(realpathSync(current), ...suffix)
}

function contains(parent, child) {
  const remainder = relative(parent, child)
  return remainder === '' || (!isAbsolute(remainder) && remainder !== '..' && !remainder.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))
}

/**
 * Resolve private state before Electron or Host reads any personal data.
 * @param {import('./product-types.js').DesktopProduct} product Standalone identity.
 * @param {string} userHome OS user home.
 * @param {NodeJS.ProcessEnv} environment Launch settings; native official roots are protected.
 * @param {boolean} packaged Installed applications ignore development-only locations.
 * @returns {{ home: string, agents: string, userData: string, sessionData: string, logs: string }} Private state paths.
 */
export function desktopProductPaths(product, userHome, environment, packaged) {
  const expand = value => value === '~' ? userHome : /^~[/\\]/u.test(value) ? join(userHome, value.slice(2)) : value
  const selected = expand((!packaged ? environment.DSH_DESKTOP_PRODUCT_HOME : undefined)
    ?? environment[`${product.protocol.toUpperCase().replaceAll('-', '_')}_HOME`] ?? join(userHome, product.homeDirectory))
  if (!isAbsolute(selected)) throw new Error('desktop product: home must be absolute')
  const home = canonical(selected)
  const installedHome = canonical(expand(environment[`${product.protocol.toUpperCase().replaceAll('-', '_')}_HOME`] ?? join(userHome, product.homeDirectory)))
  if (!packaged && (contains(installedHome, home) || contains(home, installedHome))) {
    throw new Error('desktop product: development state overlaps installed state')
  }
  const official = [join(userHome, '.dsh'), join(userHome, '.agents'), environment.DSH_HOME, environment.DSH_AGENTS_HOME]
    .filter(Boolean).map(path => canonical(expand(path)))
  if (contains(home, canonical(userHome)) || official.some(path => contains(path, home) || contains(home, path))) {
    throw new Error('desktop product: home overlaps protected state')
  }
  const paths = { home, agents: join(home, product.agentsDirectory), userData: join(home, 'electron', 'user-data'),
    sessionData: join(home, 'electron', 'session-data'), logs: join(home, 'logs') }
  for (const path of Object.values(paths)) {
    if (canonical(path) !== path) throw new Error('desktop product: redirected state leaves its owned path')
  }
  for (const directory of ['profiles', 'profiles/desktop', 'sessions', 'storage', 'storages', 'dsh-runtimes', 'workspaces', 'workspaces/deepseek-harness/default-workspace']) {
    const path = join(home, directory)
    if (canonical(path) !== path) throw new Error('desktop product: redirected state leaves its owned path')
  }
  for (const file of ['.credentials.yaml', '.env', 'cordis.patch.yml', 'profiles/desktop/cordis.patch.yml', 'profiles/desktop/package.json']) {
    try {
      if (lstatSync(join(home, file)).isSymbolicLink()) throw new Error('desktop product: redirected configuration file')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return paths
}
