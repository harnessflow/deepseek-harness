/** Page-owned Loader entries; transport-independent reconciliation, retries and code replacement. */
import type { FiberState } from '@deepseek-ai/cordis'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { parseBootManifest } from './manifest.ts'
import type { BootManifest, ClientDocumentLifecycle, ClientModuleLoader } from './manifest.ts'
import { removeOwnedStyles, tearDownEntryFiber } from './entry-lifecycle.ts'

/** Page-local failures do not change the Host's bundle enablement. */
export interface ClientEntryState {
  /** True while a snapshot, retry or code replacement is being applied. */
  readonly syncing: boolean
  /** Package ids and errors from the latest reconciliation. */
  readonly failures: readonly { readonly id: string; readonly message: string }[]
}

/** Module-table capabilities used within serialized entry operations. */
interface ModuleIndex {
  update(manifest: BootManifest, managed: Iterable<string>): void
  invalidateForReplacement(id: string, rev: string): void
  prune(roots: Iterable<string>): void
}

/** Numeric values mirror Cordis's const enum, which bundle loaders cannot import as a runtime object. */
const ACTIVE = 2 as FiberState.ACTIVE
const FAILED = 3 as FiberState.FAILED

/** Revisions and requests identify desired code; URLs only select its immutable delivery resource. */
function entryTargets(manifest: BootManifest): string {
  return JSON.stringify(manifest.modules.map(row => [row.id, row.rev, row.inject, row.external]))
}

/** Manages only entries created from the Host manifest; other Loader contributors retain ownership. */
export class ClientEntries {
  /** Stable observable consumed by page diagnostics through the renderer's injected hook. */
  readonly state: ObservableSnapshot<ClientEntryState> = {
    getSnapshot: () => this.snapshot,
    subscribe: (listener) => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    },
  }
  // The modules bootstrap factory cannot request platform libraries before the shell supplies its seed.
  private snapshot: ClientEntryState = { syncing: false, failures: [] }
  private readonly listeners = new Set<() => void>()
  private readonly managed = new Map<string, Entry>()
  private readonly revisions = new Map<string, string>()
  private loader: Loader | undefined
  private queue: Promise<void> = Promise.resolve()
  private desired: BootManifest
  private generation = 0
  private stopped = false
  private checking: AbortController | undefined

  get isStopped(): boolean { return this.stopped }

  /** Close admission immediately; native work already in flight drains in the existing queue. */
  stop(): Promise<void> {
    this.stopped = true
    this.generation++
    this.checking?.abort()
    return this.queue
  }

  /**
   * Construct the page controller before Cordis boot.
   * @param modules - Module arrival and materialization owner.
   * @param index - Private descriptor replacement and unused-module cleanup.
   */
  constructor(
    private readonly modules: ClientModuleLoader,
    private readonly index: ModuleIndex,
    private readonly document?: ClientDocumentLifecycle,
  ) {
    this.desired = modules.manifest
    document?.signal.addEventListener('abort', () => { void this.stop() }, { once: true })
    if (document?.signal.aborted) void this.stop()
  }

  /**
   * Create the initial roster and retain its entry identities for subsequent reconciliation.
   * @param loader - Page Loader, already configured with the module system.
   * @param manifest - Initial roster audited by the boot caller.
   * @returns after initial entries and their activation settle; boot owns its activation audit.
   */
  start(loader: Loader, manifest: BootManifest): Promise<void> {
    if (this.loader !== undefined) throw new Error('client-modules: entries already started')
    this.loader = loader
    this.desired = manifest
    loader.ctx.effect(() => () => this.stop(), 'client-modules: entry reconciliation')
    return this.enqueue(async (generation) => {
      const manifest = this.desired
      await Promise.all(manifest.plugins.filter(row => row.immediately)
        .map(row => this.modules.prefetch(row.id).catch(() => {})))
      if (!this.current(generation)) return
      const results = await Promise.allSettled(manifest.plugins.map(async ({ id }) => {
        if (this.current(generation)) await this.create(loader, id)
      }))
      const failure = results.find(result => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
      await loader.await()
      if (this.current(generation)) {
        for (const row of manifest.modules) this.revisions.set(row.id, row.rev)
      }
    }).then(() => {
      if (this.stopped) throw new DOMException('Document withdrawn', 'AbortError')
    })
  }

  /**
   * Validate and apply the latest full Host graph. Changed targets cancel obsolete mounts; identical targets share pending loads.
   * @param graph - JSON-decoded graph received from the Host.
   * @returns after the queued reconciliation; per-package failures remain available in {@link state}.
   */
  sync(graph: unknown): Promise<void> {
    if (this.stopped) return Promise.resolve()
    const manifest = parseBootManifest(graph)
    if (entryTargets(manifest) !== entryTargets(this.desired)) {
      this.generation++
      this.checking?.abort()
    }
    this.desired = manifest
    const generation = this.generation
    return this.enqueue(() => this.reconcile(generation))
  }

  /**
   * Retry failed entries against the latest graph, including an unchanged revision.
   * @returns after retry settlement, with remaining errors in {@link state}.
   */
  retry(): Promise<void> {
    if (this.stopped) return Promise.resolve()
    this.checking?.abort()
    const generation = ++this.generation
    return this.enqueue(() => this.reconcile(generation))
  }

  /**
   * Replace one entry's code in the same queue as graph updates; duplicate revisions are ignored.
   * Entries missing after a failed import are reconciled; bootstrap replacement fails before teardown.
   * @param id - Package id from a rebuilt frame.
   * @param rev - Opaque revision selecting the rebuilt artifact.
   * @returns after queued work; replacement errors reject, while per-package reconciliation errors remain in {@link state}.
   */
  reload(id: string, rev: string): Promise<void> {
    if (this.stopped) return Promise.resolve()
    this.desired = {
      ...this.desired,
      modules: this.desired.modules.map(row => row.id === id ? { ...row, rev } : row),
    }
    return this.enqueue(async (generation) => {
      const desired = this.desired.modules.find(row => row.id === id)
      if (this.stopped || desired === undefined) return
      const entry = this.managed.get(id)
      if (entry === undefined) {
        this.modules.invalidate(id, desired.rev)
        removeOwnedStyles(id)
        await this.reconcile(generation)
        return
      }
      if (this.revisions.get(id) === rev) return
      this.publish({ syncing: true, failures: this.snapshot.failures.filter(failure => failure.id !== id) })
      await this.replace(entry, id, rev, generation)
      if (this.current(generation)) this.publish({ syncing: false, failures: this.snapshot.failures })
    }, id)
  }

  private publish(snapshot: ClientEntryState): void {
    this.snapshot = snapshot
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch (error) {
        // The page controller has no owning plugin Context for a scoped logger.
        console.error('client-modules: synchronization subscriber failed', error)
      }
    }
  }

  private enqueue(task: (generation: number) => Promise<void>, subject = 'graph'): Promise<void> {
    const generation = this.generation
    const run = this.queue.then(async () => {
      if (await this.admit(generation)) await task(generation)
    })
    // Each operation reports its own failure; later operations must still run.
    this.queue = run.then(() => undefined, (error: unknown) => {
      this.publish({ syncing: false, failures: [
        ...this.snapshot.failures.filter(failure => failure.id !== subject),
        { id: subject, message: String(error) },
      ] })
    })
    return run
  }

  private current(generation: number): boolean {
    return !this.stopped && generation === this.generation
  }

  private async admit(generation: number): Promise<boolean> {
    if (!this.current(generation)) return false
    const document = this.document
    const check = document?.check
    if (document === undefined || check === undefined) return true
    const checking = new AbortController()
    this.checking = checking
    const signal = AbortSignal.any([document.signal, checking.signal])
    let cancel: () => void = () => {}
    try {
      // The race settles even when check ignores its signal. Both late outcomes have handlers.
      const accepted = await new Promise<boolean>((resolve, reject) => {
        cancel = () => resolve(false)
        signal.addEventListener('abort', cancel, { once: true })
        if (signal.aborted) { cancel(); return }
        Promise.resolve().then(() => check(signal)).then(
          value => resolve(!signal.aborted && value),
          error => { if (signal.aborted) resolve(false); else reject(error) },
        )
      })
      if (signal.aborted || !this.current(generation)) return false
      if (accepted) return true
      void document.withdraw().catch(error => console.error(error))
      return false
    } catch (error) {
      if (signal.aborted || !this.current(generation)) return false
      void document.withdraw().catch(reason => console.error(reason))
      throw error
    } finally {
      signal.removeEventListener('abort', cancel)
      if (this.checking === checking) this.checking = undefined
    }
  }

  /** Keep ownership even when Loader rejects a module's plugin exports after inserting its entry. */
  private async create(loader: Loader, id: string): Promise<void> {
    const options = { name: id }
    const entryId = loader.ensureId(options)
    try {
      await loader.create(options)
    } finally {
      if (!this.stopped) this.managed.set(id, loader.resolve(entryId))
    }
  }

  private async replace(entry: Entry, id: string, rev: string, generation: number): Promise<void> {
    this.index.invalidateForReplacement(id, rev)
    await this.modules.prefetch(id)
    if (!this.current(generation)) return
    await tearDownEntryFiber(entry)
    if (!this.current(generation)) return
    removeOwnedStyles(id)
    await this.modules.import(id, '', {})
    if (!this.current(generation)) return
    await entry.refresh()
    if (!this.current(generation)) return
    await entry.fiber?.await()
    if (!this.current(generation)) return
    if (entry.fiber === undefined) throw new Error(`client-modules: ${id} import failed (see console)`)
    this.revisions.set(id, rev)
  }

  private async reconcile(generation: number): Promise<void> {
    if (!this.current(generation)) return
    const loader = this.loader
    if (loader === undefined) throw new Error('client-modules: entries have not started')
    const manifest = this.desired
    this.publish({ syncing: true, failures: [] })
    const failures: { id: string; message: string }[] = []
    this.index.update(manifest, this.managed.keys())
    const wanted = new Set(manifest.plugins.map(row => row.id))
    for (const [id, entry] of this.managed) {
      if (!this.current(generation)) return
      if (wanted.has(id)) continue
      const fiber = entry.fiber
      loader.remove(entry.id)
      this.managed.delete(id)
      this.revisions.delete(id)
      // Removed fibers no longer appear in Loader.getTasks().
      while (fiber?.inertia !== undefined) await fiber.inertia
    }
    for (const row of manifest.modules) {
      if (!this.current(generation)) break
      try {
        const entry = this.managed.get(row.id)
        if (entry === undefined) {
          await this.modules.prefetch(row.id)
          if (!this.current(generation)) break
          await this.modules.import(row.id, '', {})
          if (!this.current(generation)) break
          await this.create(loader, row.id)
          if (!this.current(generation)) break
          this.revisions.set(row.id, row.rev)
        } else if (this.revisions.get(row.id) !== row.rev) {
          await this.replace(entry, row.id, row.rev, generation)
        } else if (entry.fiber === undefined) {
          await this.replace(entry, row.id, row.rev, generation)
        } else if (entry.fiber.state === FAILED) {
          entry.fiber.update(entry.options.config)
        }
      } catch (error) {
        failures.push({ id: row.id, message: String(error) })
      }
    }
    await loader.await()
    if (!this.current(generation)) return
    for (const [id, entry] of this.managed) {
      if (failures.some(failure => failure.id === id)) continue
      if (entry.fiber?.state === ACTIVE) continue
      try {
        if (entry.fiber === undefined) throw new Error(`client-modules: ${id} import failed (see console)`)
        await entry.fiber.await()
        if (!this.current(generation)) return
        failures.push({ id, message: `client-modules: ${id} is waiting for activation` })
      } catch (error) {
        failures.push({ id, message: String(error) })
      }
    }
    if (this.current(generation)) this.index.prune([...loader.entries()].map(entry => entry.options.name))
    if (this.current(generation)) this.publish({ syncing: false, failures })
  }
}
