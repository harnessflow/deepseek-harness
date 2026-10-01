/** The pinned builder template keeps its registration flow around staged directory replacement. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { desktopInstallerHomeDefines, directoryInstallerExits, directoryInstallSection, directoryUninstaller } from '../scripts/windows-directory-installer.mjs'

const require = createRequire(import.meta.url)
const section = readFileSync(join(dirname(require.resolve('app-builder-lib/package.json')),
  'templates/nsis/installSection.nsh'), 'utf8')

it('protects the standalone home without borrowing the official environment variable', () => {
  expect(desktopInstallerHomeDefines()).toBe('')
  const identity = { name: 'Product Test', version: '1.0.0', appId: 'org.example.product',
    packageName: '@example/product', artifactPrefix: 'product', protocol: 'product-test',
    homeDirectory: '.product-test', agentsDirectory: 'agents', bundlePackage: '@example/bundle', updateMode: 'manual' }
  const defines = desktopInstallerHomeDefines(identity)
  expect(defines).toContain('DSH_DISTRIBUTION_HOME_ENV "PRODUCT_TEST_HOME"')
  expect(defines).toContain('DSH_DISTRIBUTION_HOME_DIRECTORY ".product-test"')
  expect(defines).toContain('DSH_DISTRIBUTION_PROTOCOL "product-test"')
  expect(defines).not.toContain('"DSH_HOME"')
  expect(() => desktopInstallerHomeDefines({ ...identity, homeDirectory: 'bad"definition' })).toThrow(/invalid/u)
  const uninstaller = readFileSync(new URL('../installer/uninstall.nsh', import.meta.url), 'utf8')
  expect(uninstaller).toContain('ReadEnvStr $UnHome "${DSH_DISTRIBUTION_HOME_ENV}"')
  expect(uninstaller).toContain('$PROFILE\\${DSH_DISTRIBUTION_HOME_DIRECTORY}')
})

it('unregisters only the standalone protocol owned by the removed installation, outside updates', () => {
  const source = readFileSync(new URL('../scripts/installer.nsh', import.meta.url), 'utf8')
  const hook = source.split('!macro customUnInstall\n')[1]?.split('!macroend')[0]
  expect(hook).toContain('!ifdef DSH_DISTRIBUTION_PROTOCOL')
  expect(hook).toContain('${IfNot} ${isUpdated}')
  expect(hook).toContain('ReadRegStr $R0 HKCU "Software\\Classes\\${DSH_DISTRIBUTION_PROTOCOL}\\shell\\open\\command" ""')
  expect(hook).toContain('StrCpy $R1 \'$\\"$INSTDIR\\${APP_EXECUTABLE_FILENAME}$\\"\'')
  expect(hook).toContain('StrCpy $R0 $R0 $R2')
  expect(hook).toContain('${If} $R0 == $R1')
  expect(hook).toContain('DeleteRegKey HKCU "Software\\Classes\\${DSH_DISTRIBUTION_PROTOCOL}"')
  expect(hook).not.toContain('Software\\Classes\\dsh')
  expect(hook).toContain('Call un.CleanData')
})

it('keeps data cleanup out of the upstream template while retaining application removal and registration cleanup', () => {
  const source = readFileSync(join(dirname(require.resolve('app-builder-lib/package.json')), 'templates/nsis/uninstaller.nsh'), 'utf8')
  const adapted = directoryUninstaller(source)
  expect(adapted).not.toContain('--delete-app-data')
  expect(adapted).not.toContain('RMDir /r "$APPDATA')
  expect(adapted).toContain('!insertmacro customUnInstall')
  expect(adapted).toContain('DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"')
  expect(adapted).toContain('DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}"')
  expect(directoryUninstaller(source.replaceAll('\n', '\r\n'))).toBe(adapted)
  expect(adapted).toContain('RMDir /r "\\\\?\\$INSTDIR"')
  expect(() => directoryUninstaller(source.replace('  Var /GLOBAL isDeleteAppData\n', ''))).toThrow('template changed')
  expect(() => directoryUninstaller(source.replace('  DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"', ''))).toThrow('template changed')
})

it.each(['allowOnlyOneInstallerInstance.nsh', 'installUtil.nsh'])('cleans staged files before %s exits', (helper) => {
  const source = readFileSync(join(dirname(require.resolve('app-builder-lib/package.json')), 'templates/nsis/include', helper), 'utf8')
  const exits = source.match(/^\s*Quit\s*$/gm) ?? []
  expect(exits.length).toBeGreaterThan(0)
  const adapted = directoryInstallerExits(source)
  expect(adapted.match(/Call dshCleanupDirectories/g)).toHaveLength(exits.length)
  expect(adapted).toContain('!ifndef BUILD_UNINSTALLER')
})

it('stages before stopping the application and promotes before registering the installation', () => {
  const result = directoryInstallSection(section)
  expect(result.indexOf('!insertmacro dshStageApplication')).toBeLessThan(result.indexOf('!insertmacro CHECK_APP_RUNNING'))
  expect(result.indexOf('Call dshPromoteDirectories')).toBeLessThan(result.indexOf('!insertmacro registryAddInstallInfo'))
  expect(result).toContain('!insertmacro addStartMenuLink $keepShortcuts')
  expect(result).toContain('!insertmacro addDesktopLink $keepShortcuts')
  expect(result).toContain('!insertmacro handleUninstallResult HKEY_CURRENT_USER')
  expect(result).not.toContain('!insertmacro installApplicationFiles')
  expect(result).not.toContain('File /oname=uninstallerIcon.ico')
})

it.each(['!include installer.nsh', '!insertmacro setLinkVars', '!insertmacro installApplicationFiles'])(
  'rejects a missing or duplicate upstream insertion point: %s', (point) => {
    expect(() => directoryInstallSection(section.replace(point, ''))).toThrow('Desktop NSIS template changed')
    expect(() => directoryInstallSection(`${section}\n${point}`)).toThrow('Desktop NSIS template changed')
  },
)
