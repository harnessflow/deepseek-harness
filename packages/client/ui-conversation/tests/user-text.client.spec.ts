import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { UserTextPresentationRegistry } from '../src/client/conversation/user-text.ts'
import { HeroConfig } from '../src/hero-config.ts'

describe('plain user text presentation', () => {
  it('delegates legacy/edited input, reads the current cwd and removes contributions with their owner', async () => {
    const ctx = new Context()
    const registry = new UserTextPresentationRegistry(ctx)
    let cwd = '/project/first'
    const face = registry.face(() => cwd)
    const changed = vi.fn()
    const stop = face.subscribe(changed)
    const fiber = ctx.plugin({ apply(owner: Context) {
      owner.effect(() => registry.register({ key: 'test-audit', present: input =>
        input.requestId === 'origin-id' && input.text === '/audit original' ? `Audit · ${input.cwd}` : undefined }))
    } })
    await fiber.await()
    expect(face.present('/audit original')).toBeUndefined()
    expect(face.present('/audit edited', 'origin-id')).toBeUndefined()
    expect(face.present('/audit original', 'origin-id')).toBe('Audit · /project/first')
    cwd = '/project/second'
    expect(face.present('/audit original', 'origin-id')).toBe('Audit · /project/second')
    await fiber.dispose()
    expect(face.present('/audit original', 'origin-id')).toBeUndefined()
    expect(face.getSnapshot()).toEqual([])
    expect(changed).toHaveBeenCalledTimes(2)
    stop()
    await ctx.fiber.dispose()
  })

  it('validates LocalizedText with an English fallback and retains alternate locales', () => {
    expect(HeroConfig({})).toEqual({})
    expect(HeroConfig({ headline: { en: 'Audit', zh: '审计' }, showPreviewBadge: false }))
      .toEqual({ headline: { en: 'Audit', zh: '审计' }, showPreviewBadge: false })
    expect(HeroConfig['~standard'].validate({ headline: { zh: '审计' } })).toHaveProperty('issues')
  })
})
