import { describe, expect, it } from 'vitest'
import { presentEntries } from '../src/present-entries.ts'

describe('display entries', () => {
  it('retains unconfigured order, exact filtering and source identities', () => {
    const rows = [{ id: 'custom-deepseek' }, { id: 'deepseek-official' }, { id: 'relay' }, { id: 'other' }]
    expect(presentEntries(rows, row => row.id)).toEqual(rows)
    const displayed = presentEntries(rows, row => row.id, ['relay'], ['deepseek-official'])
    expect(displayed).toEqual([rows[2], rows[0], rows[3]])
    expect(displayed[0]).toBe(rows[2])
    expect(rows.map(row => row.id)).toEqual(['custom-deepseek', 'deepseek-official', 'relay', 'other'])
    expect(presentEntries([], row => row)).toEqual([])
    expect(presentEntries(rows, row => row.id, ['other', 'relay'], ['relay'])).toEqual([rows[3], rows[0], rows[1]])
  })
})
