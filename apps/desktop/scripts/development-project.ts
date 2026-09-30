/** Prepare the disposable npm-project view used by an unpackaged Electron shell. */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { createDevelopmentProjectMetadata } from '../src/project-manager.ts'
import type { DesktopRelease } from '../src/release.ts'
import { DESKTOP_RUNTIME_FILE, type DesktopRuntimeDescriptor } from '../src/runtime-tree.ts'
import type { DesktopAutoUpdateTarget } from './desktop-auto-update-environment.mjs'
import { desktopTargetPlatform } from './desktop-build-paths.mjs'

interface PackageManifest {
  readonly name?: string
  readonly version?: string
  readonly dependencies?: Readonly<Record<string, string>>
}

/** Inputs whose locations differ between the launcher and isolated tests. */
export interface DevelopmentProjectOptions {
  /** Directory replaced with the generated development project. */
  readonly projectDir: string
  /** Current workspace's `apps/cli` package directory. */
  readonly cliDir: string
  /** Current workspace's private Desktop Host application directory. */
  readonly hostDir: string
  /** pnpm's workspace-wide virtual-hoist directory. */
  readonly dependencyDir: string
  /** Release identity written into the disposable project metadata. */
  readonly release: DesktopRelease
  /** Build target whose prepared payload the disposable project runs against. */
  readonly target: DesktopAutoUpdateTarget
  /** Explicit local external packages; never discovered from sibling checkouts. */
  readonly packages?: Readonly<Record<string, string>>
}

function readManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest
}

/** Validate explicit product package inputs before replacing any disposable project. */
export function parseDevelopmentPackages(value: unknown): Readonly<Record<string, string>> {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('desktop development: product packages must be a package-to-directory object')
  }
  const packages: Record<string, string> = {}
  for (const [name, directory] of Object.entries(value)) {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(name)
      || name.startsWith('@deepseek-ai/') || name === 'node_modules') {
      throw new Error(`desktop development: invalid or reserved external package name ${name}`)
    }
    if (typeof directory !== 'string' || !isAbsolute(directory)) {
      throw new Error(`desktop development: external package directory must be absolute for ${name}`)
    }
    const manifest = readManifest(join(directory, 'package.json'))
    if (manifest.name !== name) throw new Error(`desktop development: external package identity mismatch for ${name}`)
    if (typeof manifest.version !== 'string' || manifest.version === '') {
      throw new Error(`desktop development: external package version is missing for ${name}`)
    }
    packages[name] = directory
  }
  return packages
}

function removeOwnedPath(path: string): void {
  let stat: ReturnType<typeof lstatSync>
  try {
    stat = lstatSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (stat.isSymbolicLink()) {
    unlinkSync(path)
    return
  }
  if (stat.isDirectory()) {
    rmSync(path, { recursive: true })
    return
  }
  unlinkSync(path)
}

function linkDirectory(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true })
  symlinkSync(realpathSync(source), destination, process.platform === 'win32' ? 'junction' : 'dir')
}

function mirrorDependencyLinks(sourceRoot: string, destinationRoot: string): string[] {
  const names: string[] = []
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.name === '.bin') continue
    const source = join(sourceRoot, entry.name)
    if (entry.name.startsWith('@') && (entry.isDirectory() || entry.isSymbolicLink())) {
      mkdirSync(join(destinationRoot, entry.name), { recursive: true })
      for (const scoped of readdirSync(source, { withFileTypes: true })) {
        if (!scoped.isDirectory() && !scoped.isSymbolicLink()) continue
        linkDirectory(join(source, scoped.name), join(destinationRoot, entry.name, scoped.name))
        names.push(`${entry.name}/${scoped.name}`)
      }
      continue
    }
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      linkDirectory(source, join(destinationRoot, entry.name))
      names.push(entry.name)
    }
  }
  return names
}

/** Configured workspace plugins must resolve from the profile even when pnpm does not hoist them. */
function mirrorWorkspaceDependencies(roots: readonly string[], destinationRoot: string): string[] {
  const names: string[] = []
  const visited = new Set<string>()
  const visit = (directory: string): void => {
    const source = realpathSync(directory)
    if (visited.has(source)) return
    visited.add(source)
    const manifest = readManifest(join(source, 'package.json'))
    for (const [name, specifier] of Object.entries(manifest.dependencies ?? {})) {
      if (!specifier.startsWith('workspace:')) continue
      const dependency = join(source, 'node_modules', ...name.split('/'))
      if (!existsSync(dependency)) {
        throw new Error(`desktop development: ${name} is missing from ${source}; run pnpm install`)
      }
      const destination = join(destinationRoot, ...name.split('/'))
      removeOwnedPath(destination)
      linkDirectory(dependency, destination)
      names.push(name)
      visit(dependency)
    }
  }
  for (const directory of roots) visit(directory)
  return names
}

/**
 * Replace one disposable project with links to the current built workspace.
 * @param options - Project destination, CLI package, release identity, and build target.
 * @returns the absolute project directory supplied by the caller.
 */
export function prepareDevelopmentProject(options: DevelopmentProjectOptions): string {
  const packages = parseDevelopmentPackages(options.packages)
  const cliManifest = readManifest(join(options.cliDir, 'package.json'))
  if (cliManifest.name !== '@deepseek-ai/dsh' || cliManifest.version !== options.release.version) {
    throw new Error(
      `desktop development: apps/cli must be @deepseek-ai/dsh@${options.release.version}, found `
      + `${String(cliManifest.name)}@${String(cliManifest.version)}`,
    )
  }
  if (!existsSync(options.dependencyDir)) {
    throw new Error('desktop development: workspace dependency links are missing; run pnpm install')
  }
  const hostManifest = readManifest(join(options.hostDir, 'package.json'))
  if (hostManifest.name !== '@deepseek-ai/dsh-desktop-host' || hostManifest.version !== options.release.version) {
    throw new Error(
      `desktop development: apps/desktop-host must be @deepseek-ai/dsh-desktop-host@${options.release.version}, found `
      + `${String(hostManifest.name)}@${String(hostManifest.version)}`,
    )
  }
  if (!existsSync(join(options.hostDir, 'lib', 'index.js'))) {
    throw new Error('desktop development: apps/desktop-host/lib/index.js is missing; run pnpm run build')
  }

  removeOwnedPath(options.projectDir)
  const externalDependencies = Object.fromEntries(Object.entries(packages).map(([name, directory]) =>
    [name, readManifest(join(directory, 'package.json')).version!]))
  createDevelopmentProjectMetadata(options.projectDir, options.release, externalDependencies)
  const destinationModules = join(options.projectDir, 'node_modules')
  mkdirSync(destinationModules, { recursive: true })
  const names = [
    ...mirrorDependencyLinks(options.dependencyDir, destinationModules),
    ...mirrorWorkspaceDependencies([options.cliDir, options.hostDir], destinationModules),
  ]
  const dshLink = join(destinationModules, '@deepseek-ai', 'dsh')
  removeOwnedPath(dshLink)
  linkDirectory(options.cliDir, dshLink)
  const hostLink = join(destinationModules, '@deepseek-ai', 'dsh-desktop-host')
  removeOwnedPath(hostLink)
  linkDirectory(options.hostDir, hostLink)
  for (const [name, directory] of Object.entries(packages)) {
    const destination = join(destinationModules, name)
    removeOwnedPath(destination)
    linkDirectory(directory, destination)
    names.push(name)
  }
  const sharedPackages = [...new Set([...names, '@deepseek-ai/dsh', '@deepseek-ai/dsh-desktop-host'])].flatMap((name) => {
    const manifest = readManifest(join(destinationModules, name, 'package.json'))
    return typeof manifest.version === 'string' ? [{ name, version: manifest.version, path: `node_modules/${name}` }] : []
  })
  // pnpm's NODE_PATH can find source peers that ESM cannot resolve from their declaring package.
  if (Object.keys(packages).length > 0) {
    createDevelopmentProjectMetadata(options.projectDir, options.release,
      Object.fromEntries(sharedPackages.map(record => [record.name, record.version])))
  }
  const runtime: DesktopRuntimeDescriptor = { schemaVersion: 1, release: options.release,
    ...desktopTargetPlatform(options.target), sharedPackages, files: [] }
  writeFileSync(join(options.projectDir, DESKTOP_RUNTIME_FILE), `${JSON.stringify(runtime, undefined, 2)}\n`)
  return options.projectDir
}
