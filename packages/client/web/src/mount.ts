/**
 * Application mount through a dependency fiber, so replacing `uiRenderer`
 * remounts the application. Shared by `AppWebEntry` and the test carrier.
 * @module @deepseek-ai/dsh-client-web/src/mount
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

/**
 * Mount the UI renderer into `container` through a dependency fiber on
 * `uiRenderer`: the mount effect installs when the service is provided and
 * reinstalls when it is replaced.
 * @param ctx - booted root Context.
 * @param container - application mount point.
 * @returns resolves once the dependency fiber exists; with `uiRenderer`
 * already provided (as after `bootClient`) the mount effect is installed by
 * then, otherwise it installs when the service arrives.
 */
export interface ClientMount {
  ready: Promise<void>
  dispose(): Promise<void>
}

/** Publish the handle synchronously; a withdrawn carrier can also cancel a pending mount. */
export function createClientMount(ctx: Context, container: HTMLElement, signal?: AbortSignal): ClientMount {
  let closed = false, rootDispose: (() => void) | undefined, disposing: Promise<void> | undefined
  const mounted = ctx.inject(['uiRenderer'], (scope) => {
    if (closed || signal?.aborted) return
    scope.effect(() => {
      if (closed || signal?.aborted) return () => {}
      const unmount = scope.uiRenderer.mount(container)
      let disposed = false
      const dispose = (): void => {
        if (disposed) return
        disposed = true
        if (rootDispose === dispose) rootDispose = undefined
        unmount()
      }
      if (closed || signal?.aborted) dispose()
      else rootDispose = dispose
      return dispose
    }, 'web boot: application mount')
  })
  return {
    ready: mounted.await().then(() => undefined),
    dispose() {
      if (disposing !== undefined) return disposing
      closed = true
      let failed = false, failure: unknown
      try { rootDispose?.() } catch (error) { failed = true; failure = error }
      const cleanup = mounted.dispose()
      disposing = cleanup.then(() => { if (failed) throw failure }, (error: unknown) => {
        throw failed ? failure : error
      })
      return disposing
    },
  }
}

export async function mountClient(ctx: Context, container: HTMLElement): Promise<void> {
  await createClientMount(ctx, container).ready
}
