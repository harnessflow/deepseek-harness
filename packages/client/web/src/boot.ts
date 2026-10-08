/**
 * Web boot kernel. It owns only the module system, Cordis loader, and a
 * framework-free boot page; plugin composition and the renderer handoff are
 * `bootClient` and `mountClient`. The dynamic UI renderer receives the mount
 * point after every client entry activates.
 * @module @deepseek-ai/dsh-client-web/src/boot
 */
import { Context } from '@deepseek-ai/cordis'
import type {
  BootManifest, ClientDocumentLifecycle, ClientModuleCreateOptions, ClientModuleSystem, DshWindow,
} from '@deepseek-ai/dsh-client-modules/client'
import { bootClient } from './boot-client.ts'
import { BootPage } from './boot-page.ts'
import { createClientMount } from './mount.ts'
import type { ClientMount } from './mount.ts'
import { getStaticModules } from './seed.ts'
import { installWindowDragRecall } from './window-drag/recall.ts'
import './base.css'

/** Module transport hook replaced by jsdom tests. */
export type BootSeams = Pick<ClientModuleCreateOptions, 'loadBundle'>

/** Browser boot entry consumed by `apps/web`. */
export class AppWebEntry {
  private readonly container: HTMLElement
  private readonly seams: BootSeams | undefined
  private readonly page: BootPage
  private ctx: Context | undefined
  private stopDragRecall: (() => void) | undefined
  private modules!: ClientModuleSystem
  private manifest!: BootManifest
  private document: ClientDocumentLifecycle | undefined
  private mount: ClientMount | undefined
  private runTask: Promise<void> | undefined
  private disposing: Promise<void> | undefined
  private readonly closed = Promise.withResolvers<void>()
  private stopped = false

  /**
   * Draw the boot page; {@link run} starts the loader.
   * @param container - Application mount point.
   * @param seams - Optional module transport replacement.
   */
  constructor(container: HTMLElement, seams?: BootSeams) {
    this.container = container
    this.seams = seams
    this.page = new BootPage(container)
  }

  /**
   * Load and activate every client entry, then hand the mount point to the
   * UI renderer. Plugin failures remain visible on the boot page.
   * @param onFailure - Optional carrier-owned fatal presentation; keeps the boot page visible.
   * @returns Resolves after application mount or failure reporting.
   */
  run(onFailure?: (reason: unknown) => void): Promise<void> {
    return this.runTask ??= this.start(onFailure)
  }

  private async start(onFailure?: (reason: unknown) => void): Promise<void> {
    try {
      // Boot-readiness gate: whichever bootstrap applies the injection table
      // settles this deferred once every row has taken effect — the served
      // index resolves it in the rendered tail, so the await returns on the
      // next microtask; an asynchronous bootstrap resolves it after its last
      // row, or rejects it into the failure rendering below. An absent global
      // means no bootstrap owns the document and there is nothing to wait for.
      await Promise.race([
        (globalThis as { __DSH_BOOT_READY__?: { promise: Promise<void> } }).__DSH_BOOT_READY__?.promise,
        this.closed.promise,
      ])
      if (this.stopped) return
      const win = globalThis as DshWindow
      const moduleLoader = win.__ModuleLoader__
      if (moduleLoader === undefined) {
        throw new Error('web boot: window.__ModuleLoader__ bootstrap facade is missing')
      }
      // A pre-injected transport (the worker preview page) owns bundle bytes;
      this.document = moduleLoader.document
      this.document?.bind(() => this.disposeDocument())
      if (this.document?.signal.aborted || this.stopped) return
      // its loadBundle is the default and explicit seams still win. The global
      // is `ClientTransportHooks`, owned by @deepseek-ai/dsh-client-connection;
      // this structural slice reads one optional member without adding a
      // package edge.
      const transport = (globalThis as {
        __DSH_TRANSPORT__?: { loadBundle?: ClientModuleCreateOptions['loadBundle'] }
      }).__DSH_TRANSPORT__
      this.modules = moduleLoader.create({
        boot: win.__DSH_BOOT__,
        staticModules: getStaticModules(),
        ...transport?.loadBundle === undefined ? {} : { loadBundle: transport.loadBundle },
        ...this.seams,
      })
      this.manifest = this.modules.manifest

      const ctx = new Context()
      this.ctx = ctx
      this.page.setTotal(this.manifest.plugins.length)
      await bootClient({
        ctx,
        modules: this.modules,
        manifest: this.manifest,
        onEntryState: (name, state) => {
          if (onFailure === undefined || state !== 'failed') this.page.setState(name, state)
        },
      })
      // The shell owns the one watcher that keeps Electron's window drag rects in
      if (this.document?.signal.aborted || this.stopped) return
      // step with the rows that own them (electron#32341), so no chrome row has to
      // know that trap. It installs before the first mount, so the surface the
      // renderer draws is the one the first frame measures.
      this.stopDragRecall = installWindowDragRecall({ document: this.container.ownerDocument })
      this.mount = createClientMount(ctx, this.container, this.document?.signal)
      if (this.document?.signal.aborted || this.stopped) await this.mount.dispose()
      else await this.mount.ready
    } catch (reason) {
      if (this.stopped || this.document?.signal.aborted) return
      console.error(reason)
      if (onFailure !== undefined) onFailure(reason)
      else this.page.fail(reason instanceof Error ? reason.message : String(reason))
    }
  }

  /** Dispose the client plugin tree and whichever page owns the mount point. */
  dispose(): Promise<void> {
    return this.disposeDocument()
  }

  private disposeDocument(): Promise<void> {
    if (this.disposing !== undefined) return this.disposing
    this.stopped = true
    this.closed.resolve()
    let unmounting: Promise<void> | undefined, draining: Promise<void> | undefined
    try {
      this.stopDragRecall?.()
      unmounting = this.mount?.dispose()
    } catch (error) {
      unmounting = Promise.reject(error)
    } finally {
      this.stopDragRecall = undefined
      draining = this.modules?.entries.stop()
    }
    this.disposing = (async () => {
      const [unmount, drain] = await Promise.allSettled([unmounting, draining])
      if (unmount.status === 'rejected') throw unmount.reason
      if (drain.status === 'rejected') throw drain.reason
      await this.runTask
      const ctx = this.ctx
      this.ctx = undefined
      if (ctx !== undefined) await ctx.fiber.dispose()
      this.page.dispose()
    })()
    return this.disposing
  }
}
