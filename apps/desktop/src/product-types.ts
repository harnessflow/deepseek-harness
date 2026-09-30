/** Validated optional standalone Desktop distribution identity. */
export interface DesktopProduct {
  readonly name: string
  readonly version: string
  readonly appId: string
  readonly packageName: string
  readonly artifactPrefix: string
  readonly protocol: string
  readonly homeDirectory: string
  readonly agentsDirectory: string
  readonly bundlePackage: string
  readonly updateMode: 'manual'
}
