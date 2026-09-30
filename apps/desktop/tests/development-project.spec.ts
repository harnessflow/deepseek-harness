import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRuntimeResolution } from '@deepseek-ai/dsh-app-boot'
import { parseDevelopmentPackages, prepareDevelopmentProject } from '../scripts/development-project.ts'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import { DesktopProjectManager } from '../src/project-manager.ts'
import { resolveDesktopPaths } from '../src/paths.ts'
import type { DesktopRelease } from '../src/release.ts'

const roots: string[] = []

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-development-test-'))
  roots.push(root)
  return root
}

function release(version = '1.2.3'): DesktopRelease {
  return {
    schemaVersion: 1,
    version,
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: '24.17.0',
    pnpmVersion: '11.7.0',
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('desktop development project', () => {
  it.each([null, [], 'package', { '../outside': '/tmp' }, { '@deepseek-ai/dsh': '/tmp' },
    { 'node_modules': '/tmp' }, { '@product/bundle': './relative' }])('rejects invalid external packages before touching project files: %j', (packages) => {
    const root = temporaryRoot()
    const project = join(root, 'project')
    mkdirSync(project)
    writeFileSync(join(project, 'sentinel'), 'keep')
    expect(() => parseDevelopmentPackages(packages)).toThrow(/product packages|external package/u)
    expect(readFileSync(join(project, 'sentinel'), 'utf8')).toBe('keep')
  })

  it('validates local external packages and anchors their mirrored native peers at the runtime', async () => {
    const root = temporaryRoot()
    const cli = join(root, 'cli')
    const host = join(root, 'host')
    const dependency = join(root, 'bundle')
    const hoisted = join(root, 'hoisted')
    mkdirSync(cli)
    mkdirSync(join(host, 'lib'), { recursive: true })
    mkdirSync(dependency)
    mkdirSync(hoisted)
    writeFileSync(join(cli, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '1.2.3' }))
    writeFileSync(join(host, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-desktop-host', version: '1.2.3' }))
    writeFileSync(join(host, 'lib/index.js'), '')
    writeFileSync(join(dependency, 'package.json'), JSON.stringify({ name: '@product/bundle', version: '1.0.0',
      peerDependencies: { '@deepseek-ai/dsh-client-ui-renderer': '1.2.3' } }))
    const renderer = join(hoisted, '@deepseek-ai/dsh-client-ui-renderer')
    mkdirSync(renderer, { recursive: true })
    writeFileSync(join(renderer, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-client-ui-renderer', version: '1.2.3' }))
    const packages = parseDevelopmentPackages({ '@product/bundle': dependency })
    const project = prepareDevelopmentProject({ projectDir: join(root, 'runtime'), cliDir: cli, hostDir: host,
      dependencyDir: hoisted, release: release(), target: 'mac-arm64', packages })
    expect(realpathSync(join(project, 'node_modules/@product/bundle'))).toBe(realpathSync(dependency))
    const manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(manifest.dependencies['@product/bundle']).toBe('1.0.0')
    expect(manifest.dependencies['@deepseek-ai/dsh-client-ui-renderer']).toBe('1.2.3')
    const resolution = await createRuntimeResolution({ installAnchor: join(project, 'package.json'), home: join(root, 'home') })
    expect(resolution.entries.find(entry => entry.name === '@deepseek-ai/dsh-client-ui-renderer')?.declarer)
      .toBe(join(realpathSync.native(project), 'package.json'))
    expect(() => parseDevelopmentPackages({ '@product/other': dependency })).toThrow(/identity mismatch/u)
    const descriptor = JSON.parse(readFileSync(join(project, 'desktop-runtime.json'), 'utf8')) as { sharedPackages: unknown[] }
    expect(descriptor.sharedPackages).toContainEqual({ name: '@product/bundle', version: '1.0.0', path: 'node_modules/@product/bundle' })
  })

  it('includes declared workspace packages missing from the hoist directory in the runtime inventory', () => {
    const root = temporaryRoot()
    const cli = join(root, 'cli')
    const host = join(root, 'host')
    const dependency = join(root, 'unhoisted')
    const hoisted = join(root, 'hoisted')
    mkdirSync(join(cli, 'node_modules'), { recursive: true })
    mkdirSync(join(host, 'lib'), { recursive: true })
    mkdirSync(dependency)
    mkdirSync(hoisted)
    writeFileSync(join(cli, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '1.2.3', dependencies: { unhoisted: 'workspace:^' } }))
    writeFileSync(join(host, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-desktop-host', version: '1.2.3' }))
    writeFileSync(join(host, 'lib/index.js'), '')
    writeFileSync(join(dependency, 'package.json'), JSON.stringify({ name: 'unhoisted', version: '1.2.3' }))
    symlinkSync(dependency, join(cli, 'node_modules/unhoisted'), process.platform === 'win32' ? 'junction' : 'dir')
    const project = prepareDevelopmentProject({ projectDir: join(root, 'runtime'), cliDir: cli, hostDir: host, dependencyDir: hoisted, release: release(), target: 'mac-arm64' })
    expect(realpathSync(join(project, 'node_modules/unhoisted'))).toBe(realpathSync(dependency))
    const descriptor = JSON.parse(readFileSync(join(project, 'desktop-runtime.json'), 'utf8')) as { platform: string; arch: string; sharedPackages: unknown[] }
    expect(descriptor).toMatchObject({ platform: 'darwin', arch: 'arm64' })
    expect(descriptor.sharedPackages).toContainEqual({ name: 'unhoisted', version: '1.2.3', path: 'node_modules/unhoisted' })
  })

  it('manages development plugins without modifying the linked workspace packages', async () => {
    const root = temporaryRoot()
    const cli = join(root, 'apps', 'cli')
    const host = join(root, 'apps', 'desktop-host')
    const dependencies = join(root, 'workspace-dependencies')
    mkdirSync(join(cli, 'lib'), { recursive: true })
    mkdirSync(join(host, 'lib'), { recursive: true })
    mkdirSync(join(dependencies, '@scope'), { recursive: true })
    mkdirSync(join(dependencies, '@deepseek-ai', 'dsh'), { recursive: true })
    writeFileSync(join(cli, 'package.json'), '{"name":"@deepseek-ai/dsh","version":"1.2.3"}\n')
    writeFileSync(join(host, 'package.json'), '{"name":"@deepseek-ai/dsh-desktop-host","version":"1.2.3"}\n')
    writeFileSync(join(host, 'lib', 'index.js'), '')
    writeFileSync(join(dependencies, '@deepseek-ai', 'dsh', 'package.json'), '{}\n')
    mkdirSync(join(dependencies, 'plain-dependency'))
    writeFileSync(join(dependencies, 'plain-dependency', 'package.json'), '{}\n')
    mkdirSync(join(dependencies, '@scope', 'dependency'))
    writeFileSync(join(dependencies, '@scope', 'dependency', 'package.json'), '{}\n')

    const project = prepareDevelopmentProject({
      projectDir: join(root, 'development'),
      cliDir: cli,
      hostDir: host,
      dependencyDir: dependencies,
      release: release(),
      target: 'win-x64',
    })
    expect(realpathSync(join(project, 'node_modules', '@deepseek-ai', 'dsh'))).toBe(realpathSync(cli))
    expect(realpathSync(join(project, 'node_modules', '@deepseek-ai', 'dsh-desktop-host'))).toBe(realpathSync(host))
    expect(realpathSync(join(project, 'node_modules', 'plain-dependency')))
      .toBe(realpathSync(join(dependencies, 'plain-dependency')))
    expect(realpathSync(join(project, 'node_modules', '@scope', 'dependency')))
      .toBe(realpathSync(join(dependencies, '@scope', 'dependency')))
    const manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(manifest.dependencies['@deepseek-ai/dsh']).toBe('1.2.3')
    expect(manifest.dependencies['@deepseek-ai/dsh-desktop-host']).toBe('1.2.3')
    const descriptor = JSON.parse(readFileSync(join(project, 'desktop-runtime.json'), 'utf8')) as { platform: string; arch: string }
    expect(descriptor).toMatchObject({ platform: 'win32', arch: 'x64' })
    const manager = new DesktopProjectManager(resolveDesktopPaths(join(root, 'home')), {
      dsh: project,
    })
    await manager.applyRelease()
    await manager.disableAllPlugins()
    expect(readFileSync(join(cli, 'package.json'), 'utf8')).toBe('{"name":"@deepseek-ai/dsh","version":"1.2.3"}\n')
    expect(readFileSync(join(host, 'lib', 'index.js'), 'utf8')).toBe('')

  })

  it('rejects a CLI package from another release', () => {
    const root = temporaryRoot()
    const cli = join(root, 'apps', 'cli')
    const host = join(root, 'apps', 'desktop-host')
    const dependencies = join(root, 'workspace-dependencies')
    mkdirSync(join(cli, 'lib'), { recursive: true })
    mkdirSync(join(host, 'lib'), { recursive: true })
    mkdirSync(dependencies, { recursive: true })
    writeFileSync(join(cli, 'package.json'), '{"name":"@deepseek-ai/dsh","version":"2.0.0"}\n')
    writeFileSync(join(host, 'package.json'), '{"name":"@deepseek-ai/dsh-desktop-host","version":"1.2.3"}\n')
    writeFileSync(join(host, 'lib', 'index.js'), '')
    expect(() => prepareDevelopmentProject({
      projectDir: join(root, 'development'),
      cliDir: cli,
      hostDir: host,
      dependencyDir: dependencies,
      release: release(),
      target: 'mac-x64',
    })).toThrow(/must be @deepseek-ai\/dsh@1\.2\.3/u)
  })
})
