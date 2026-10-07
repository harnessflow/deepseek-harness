import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { Config, MODEL_PRESENTATION_GLOBAL, presentProviders } from '../src/presentation.ts'
import { apply } from '../src/index.ts'

describe('model presentation bootstrap', () => {
  it('retains absent native ordering and distinguishes an explicitly empty precedence', () => {
    const rows = ['custom', 'deepseek-official', 'aiqa-relay']
    expect(Config({})).toEqual({})
    expect(presentProviders(rows, id => id, Config({}), ['deepseek-official']))
      .toEqual(['deepseek-official', 'custom', 'aiqa-relay'])
    expect(presentProviders(rows, id => id, Config({ providerOrder: [] }), ['deepseek-official'])).toEqual(rows)
    const policy = Config({ providerOrder: ['aiqa-relay'], hiddenProviders: ['deepseek-official'] })
    expect(presentProviders(rows, id => id, policy)).toEqual(['aiqa-relay', 'custom'])
    expect(rows).toEqual(['custom', 'deepseek-official', 'aiqa-relay'])
    expect(Config['~standard'].validate({ hiddenProviders: 'deepseek-official' })).toHaveProperty('issues')
  })

  it('publishes configured preferences and removes its bootstrap on unload', async () => {
    const ctx = new Context()
    try {
      const config = Config({ providerOrder: ['aiqa-relay'], hiddenProviders: ['deepseek-account'] })
      const fiber = ctx.plugin({ Config, apply }, config)
      await fiber.await()
      const rows: IndexInjection[] = []
      ctx.emit('webserver/index-inject', rows)
      expect(rows).toEqual([{ kind: 'global', name: MODEL_PRESENTATION_GLOBAL, value: config }])
      await fiber.dispose()
      const after: IndexInjection[] = []
      ctx.emit('webserver/index-inject', after)
      expect(after).toEqual([])
    } finally { await ctx.fiber.dispose() }
  })
})
