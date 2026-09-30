import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRuntimeResolution } from '@deepseek-ai/dsh-app-boot'
import { afterEach, expect, it } from 'vitest'
import { desktopInstallAnchor } from '../src/runtime-profile.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'desktop-distribution-resolution-'))
  roots.push(root)
  const runtime = join(root, 'runtime')
  const writeManifest = (directory: string, manifest: object) => {
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest))
  }
  const packages = ['@deepseek-ai/dsh', '@product/bundle', '@product/brand']
  for (const name of packages) {
    const source = join(root, 'sources', name)
    writeManifest(source, { name, version: '1.0.0' })
    const destination = join(runtime, 'node_modules', name)
    mkdirSync(dirname(destination), { recursive: true })
    symlinkSync(source, destination, 'junction')
  }
  writeManifest(runtime, { name: 'desktop-runtime', dependencies: Object.fromEntries(packages.map(name => [name, '1.0.0'])) })
  return { root, runtime }
}

it('keeps the original CLI installation anchor for the official distribution', () => {
  const { runtime } = fixture()
  expect(desktopInstallAnchor(runtime)).toBe(join(runtime, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
})

it('discovers external clients even when the development CLI and products are source symlinks', async () => {
  const { root, runtime } = fixture()
  const resolution = await createRuntimeResolution({
    installAnchor: desktopInstallAnchor(runtime, '@product/bundle'), home: join(root, 'home'),
  })
  expect(resolution.entries.map(entry => entry.name)).toContain('@product/brand')
})

it('rejects an independent runtime missing its declared distribution bundle', () => {
  const { runtime } = fixture()
  expect(() => desktopInstallAnchor(runtime, '@other/bundle')).toThrow('omits distribution bundle')
})
