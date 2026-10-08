// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { createClientMount, mountClient } from '../src/mount.ts'

/** Provide a fake `uiRenderer` from its own plugin fiber so it can be replaced. */
function provideRenderer(ctx: Context, mount: (container: HTMLElement) => () => void) {
  return ctx.plugin({ apply: (scope: Context) => { scope.reflect.provide('uiRenderer', { mount }) } })
}

describe('mountClient', () => {
  it('withdraws before a pending renderer arrives and cannot mount later', async () => {
    const ctx = new Context(), mount = vi.fn(() => vi.fn())
    const handle = createClientMount(ctx, document.createElement('div'))
    await handle.dispose()
    await provideRenderer(ctx, mount).await()
    await handle.ready
    expect(mount).not.toHaveBeenCalled()
    await ctx.fiber.dispose()
  })

  it('consumes a real disposer once when withdrawal reenters root creation', async () => {
    const ctx = new Context(), controller = new AbortController(), unmount = vi.fn()
    await provideRenderer(ctx, () => { controller.abort(); return unmount }).await()
    const handle = createClientMount(ctx, document.createElement('div'), controller.signal)
    await handle.ready
    await Promise.all([handle.dispose(), handle.dispose(), ctx.fiber.dispose()])
    expect(unmount).toHaveBeenCalledOnce()
  })

  it('mounts into the container and unmounts when the tree is disposed', async () => {
    const ctx = new Context()
    const unmount = vi.fn()
    const mount = vi.fn((_container: HTMLElement) => unmount)
    provideRenderer(ctx, mount)
    const container = document.createElement('div')

    await mountClient(ctx, container)

    expect(mount).toHaveBeenCalledExactlyOnceWith(container)
    expect(unmount).not.toHaveBeenCalled()
    await ctx.fiber.dispose()
    expect(unmount).toHaveBeenCalledOnce()
  })

  it('remounts when uiRenderer is replaced', async () => {
    const ctx = new Context()
    const container = document.createElement('div')
    const first = { unmount: vi.fn(), mount: vi.fn(() => first.unmount) }
    const second = { unmount: vi.fn(), mount: vi.fn(() => second.unmount) }

    await mountClient(ctx, container)
    expect(first.mount).not.toHaveBeenCalled()

    const renderer = provideRenderer(ctx, first.mount)
    await vi.waitFor(() => { expect(first.mount).toHaveBeenCalledExactlyOnceWith(container) })

    await renderer.dispose()
    expect(first.unmount).toHaveBeenCalledOnce()

    provideRenderer(ctx, second.mount)
    await vi.waitFor(() => { expect(second.mount).toHaveBeenCalledExactlyOnceWith(container) })
    await ctx.fiber.dispose()
    expect(second.unmount).toHaveBeenCalledOnce()
  })
})
