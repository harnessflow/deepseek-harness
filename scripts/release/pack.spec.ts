import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { resolveClientBuildEnvironment, writeClientBuildRecord } from '../client-build-environment.ts'
import { releaseFamily } from './families.ts'
import { verifyPackClientBuildArtifacts } from './pack.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('requires explicit desktop-only packing, exact product identity and unchanged artifact bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-product-pack-'))
  roots.push(root)
  const product = { name: 'Example Audit', version: '0.1.0', appId: 'org.example.audit',
    packageName: '@example/audit', artifactPrefix: 'audit', protocol: 'audit', homeDirectory: '.audit',
    agentsDirectory: 'agents', bundlePackage: '@example/audit-bundle', updateMode: 'manual' }
  const environment = { DSH_DESKTOP_PRODUCT: JSON.stringify(product),
    DSH_CLIENT_COMMIT_HASH: '0123456789abcdef0123456789abcdef01234567', DSH_CLIENT_VERSION: '1.2.3' }
  mkdirSync(join(root, 'apps/web/dist'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }))
  writeFileSync(join(root, 'apps/web/dist/index.html'), '<main></main>')
  writeClientBuildRecord(root, { ...resolveClientBuildEnvironment(environment, 'desktop-product'),
    DSH_CLIENT_COMMIT_HASH: environment.DSH_CLIENT_COMMIT_HASH.slice(0, 7) })
  const dsh = releaseFamily('dsh')
  expect(() => { verifyPackClientBuildArtifacts(dsh, root, 'desktop-product', environment) }).not.toThrow()
  expect(() => { verifyPackClientBuildArtifacts(dsh, root, 'unknown', environment) }).toThrow(/client profile/u)
  expect(() => { verifyPackClientBuildArtifacts(releaseFamily('vendor'), root, 'desktop-product', environment) }).toThrow(/dsh/u)
  expect(() => { verifyPackClientBuildArtifacts(dsh, root, 'desktop-product', {
    ...environment, DSH_DESKTOP_PRODUCT: JSON.stringify({ ...product, name: 'Other product' }),
  }) }).toThrow(/DSH_CLIENT_TITLE/u)
  expect(() => { verifyPackClientBuildArtifacts(dsh, root, undefined, environment) }).toThrow()
  writeFileSync(join(root, 'apps/web/dist/index.html'), '<main>modified</main>')
  expect(() => { verifyPackClientBuildArtifacts(dsh, root, 'desktop-product', environment) }).toThrow(/artifacts differ/u)
})
