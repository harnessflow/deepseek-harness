import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { desktopProductEnvironment, desktopProductPaths, parseDesktopProduct } from '../src/product.mjs'
import { resolveDesktopLocale, resolveDesktopStartupLocale } from '../src/locale.ts'
import { resolveDesktopPolicyEnvironment } from '../scripts/desktop-policy-environment.mjs'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import { createPluginProfile, DesktopProjectManager } from '../src/project-manager.ts'
import { resolveDesktopPaths } from '../src/paths.ts'
import { runtimeFixture } from './runtime-fixture.ts'
import { needsWelcome } from '../src/welcome-api.ts'
import { selectDesktopPackageClosure } from '../scripts/prepare-package-set.ts'

const identity = { name: 'Product Test', version: '1.0.0-alpha.1', appId: 'org.example.test',
  packageName: '@example/test-desktop', artifactPrefix: 'product-test', protocol: 'product-test',
  homeDirectory: '.product-test', agentsDirectory: 'agents', bundlePackage: '@example/product', updateMode: 'manual' }
const product = parseDesktopProduct(identity)!
const roots: string[] = []
function temporaryHome(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-standalone-')))
  roots.push(root)
  return root
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('standalone desktop distribution', () => {
  it('does not require official authentication to enter a standalone workbench', () => {
    expect(needsWelcome({ loggedIn: false, hasApiKey: false })).toBe(true)
    expect(needsWelcome({ loggedIn: false, hasApiKey: false }, true)).toBe(false)
    expect(needsWelcome({ loggedIn: true, hasApiKey: false }, true)).toBe(false)
  })
  it('keeps official defaults when metadata is absent', () => {
    expect(parseDesktopProduct(undefined)).toBeUndefined()
    expect(desktopProductEnvironment({})).toBeUndefined()
    expect(resolveDesktopLocale('en').messages.aboutProduct).toBe('DeepSeek Harness')
    expect(() => resolveDesktopPolicyEnvironment({})).toThrow('HTTPS origin')
  })

  it.each([
    { protocol: 'dsh' }, { protocol: 'dsh-app' }, { homeDirectory: '.dsh' }, { homeDirectory: '..' },
    { agentsDirectory: '../agents' }, { appId: 'com.deepseek.harness' }, { updateMode: 'production' },
    { packageName: '@deepseek-ai/dsh-desktop' }, { bundlePackage: '@deepseek-ai/dsh-web-app' },
    { version: 'not-a-version' }, { name: 'line\nbreak' },
  ])('rejects invalid or official identity %j', (change) => {
    expect(() => parseDesktopProduct({ ...identity, ...change })).toThrow('desktop product:')
  })

  it('does not parse malformed metadata as official defaults', () => {
    expect(() => desktopProductEnvironment({ DSH_DESKTOP_PRODUCT: '{bad' })).toThrow('must be JSON')
  })

  it('owns state without creating files and ignores inherited original roots', () => {
    const home = temporaryHome()
    const paths = desktopProductPaths(product, home, { DSH_HOME: join(home, 'original-custom') }, true)
    expect(paths.home).toBe(join(home, '.product-test'))
    expect(paths.agents).toBe(join(paths.home, 'agents'))
    expect(paths.userData).toBe(join(paths.home, 'electron/user-data'))
    expect(desktopProductPaths(product, home, { DSH_DESKTOP_PRODUCT_HOME: join(home, 'dev') }, true)).toEqual(paths)
  })

  it.each(['.dsh', '.agents', '.', '.dsh/nested'])('refuses overlapping home %s', (suffix) => {
    const home = temporaryHome()
    expect(() => desktopProductPaths(product, home, { PRODUCT_TEST_HOME: join(home, suffix) }, true)).toThrow('overlaps')
  })

  it('keeps development separate from installed state and supports native tilde paths', () => {
    const home = temporaryHome()
    const environment = { PRODUCT_TEST_HOME: '~/installed', DSH_DESKTOP_PRODUCT_HOME: join(home, 'development') }
    expect(desktopProductPaths(product, home, environment, true).home).toBe(join(home, 'installed'))
    expect(desktopProductPaths(product, home, environment, false).home).toBe(join(home, 'development'))
    expect(() => desktopProductPaths(product, home, { ...environment, DSH_DESKTOP_PRODUCT_HOME: join(home, 'installed/child') }, false)).toThrow(/overlaps installed/u)
    expect(() => desktopProductPaths(product, home, { PRODUCT_TEST_HOME: './relative' }, true)).toThrow(/must be absolute/u)
  })

  it('refuses aliases and escaped child state without touching targets', () => {
    const home = temporaryHome()
    mkdirSync(join(home, '.dsh'))
    symlinkSync(join(home, '.dsh'), join(home, '.product-test'), process.platform === 'win32' ? 'junction' : 'dir')
    expect(() => desktopProductPaths(product, home, {}, true)).toThrow('overlaps')
    const other = temporaryHome()
    mkdirSync(join(other, '.product-test'))
    symlinkSync(join(other, '.dsh'), join(other, '.product-test', 'agents'), process.platform === 'win32' ? 'junction' : 'dir')
    expect(() => desktopProductPaths(product, other, {}, true)).toThrow('dangling')
  })

  it('retains both localized dictionaries while substituting the product name', () => {
    expect(resolveDesktopLocale('en', product.name).messages.aboutMenu).toBe('About Product Test')
    expect(resolveDesktopStartupLocale('zh', [], product.name).messages.aboutMenu).toBe('关于 Product Test')
    expect(resolveDesktopLocale('en').messages.aboutProduct).toBe('DeepSeek Harness')
  })

  it('packages a manual distribution without official policy or feed while retaining engine identity', () => {
    const artwork = temporaryHome()
    for (const file of ['icon-windows.png', 'icon-macos.png', 'tray-windows.ico', 'welcome-brand.svg',
      'brand.png', 'brand-2x.png', 'brand-dark.png', 'brand-dark-2x.png', 'uninstaller-sidebar.png']) {
      writeFileSync(join(artwork, file), 'fixture')
    }
    const env = { DSH_DESKTOP_PRODUCT: JSON.stringify(identity), DSH_DESKTOP_UNSIGNED: '1', DSH_DESKTOP_PRODUCT_ARTWORK: artwork }
    expect(resolveDesktopPolicyEnvironment(env)).toBeUndefined()
    const config = createElectronBuilderConfig(env, 'win32', 'x64')
    expect(config.productName).toBe(product.name)
    expect(config.appId).toBe(product.appId)
    expect(config.protocols[0].schemes).toEqual([product.protocol])
    expect(config.extraMetadata).toMatchObject({ name: product.packageName, version: product.version, dshDesktopProduct: product })
    expect(config.publish).toBeNull()
    expect(config.extraMetadata.dshMandatoryUpdatePolicy).toBeUndefined()
    expect(config.artifactName).toMatch(/^product-test-.*-unsigned/u)
    expect(config.asar).toBe(true)
    expect(config.win.icon).toBe(join(artwork, 'icon-windows.png'))
    expect(() => createElectronBuilderConfig({ ...env, DSH_DESKTOP_PRODUCT_ARTWORK: undefined }, 'win32', 'x64')).toThrow('artwork directory')
  })

  it('keeps mandatory bundles through profile recovery and rejects missing installed input', async () => {
    const home = temporaryHome()
    const runtime = join(home, 'runtime')
    runtimeFixture(runtime)
    const manager = new DesktopProjectManager(resolveDesktopPaths(join(home, 'state')), { dsh: runtime }, [product.bundlePackage])
    await expect(manager.applyRelease()).rejects.toThrow('missing mandatory packaged bundle')
    const bundle = join(runtime, 'node_modules', product.bundlePackage)
    mkdirSync(bundle, { recursive: true })
    writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: product.bundlePackage }))
    await manager.applyRelease()
    await manager.disableAllPlugins()
    await manager.applyRelease()
    createPluginProfile(manager.paths.profile, [product.bundlePackage])
    const { readFileSync } = await import('node:fs')
    const manifest = JSON.parse(readFileSync(join(manager.paths.profile, 'package.json'), 'utf8')) as { dsh: { profile: { bundles: string[] } } }
    expect(manifest.dsh.profile.bundles.filter((name: string) => name === product.bundlePackage)).toHaveLength(1)
  })

  it('selects the local product dependency closure and fails if its tarball is missing', () => {
    const packed = (name: string, peerDependencies = {}) => ({ tarball: `${name}.tgz`, manifest: { name, peerDependencies } })
    const inputs = new Map([
      ['@deepseek-ai/dsh', packed('@deepseek-ai/dsh')],
      ['@deepseek-ai/dsh-desktop-host', packed('@deepseek-ai/dsh-desktop-host')],
      [product.bundlePackage, packed(product.bundlePackage, { '@example/brand': '1.0.0' })],
      ['@example/brand', packed('@example/brand')],
    ])
    expect(selectDesktopPackageClosure(inputs, [product.bundlePackage]).map(entry => entry.manifest.name)).toContain('@example/brand')
    inputs.delete('@example/brand')
    expect(() => selectDesktopPackageClosure(inputs, [product.bundlePackage])).toThrow('missing local distribution package')
    inputs.delete(product.bundlePackage)
    expect(() => selectDesktopPackageClosure(inputs, [product.bundlePackage])).toThrow(`omit ${product.bundlePackage}`)
  })
})
