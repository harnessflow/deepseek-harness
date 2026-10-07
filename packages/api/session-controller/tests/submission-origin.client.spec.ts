import { describe, expect, it } from 'vitest'
import { createSubmissionRequestId, submissionOrigin } from '../src/client/submission-origin.ts'

describe('submission display origin', () => {
  it('retains unconfigured UUID identities and rejects invalid namespaces before an echo exists', () => {
    const native = createSubmissionRequestId()
    expect(native).toMatch(/^[0-9a-f-]{36}$/u)
    expect(submissionOrigin(native)).toBeUndefined()
    for (const origin of ['', 'bad:namespace', '<b>audit</b>', 'x'.repeat(129)]) {
      expect(() => createSubmissionRequestId(origin)).toThrow('invalid submission origin')
    }
  })

  it('keeps each full identity unique and treats legacy or malformed IDs as absent origins', () => {
    const first = createSubmissionRequestId('audit/start')
    const second = createSubmissionRequestId('audit/start')
    expect(first).not.toBe(second)
    expect(submissionOrigin(first)).toBe('audit/start')
    for (const value of [undefined, 'legacy-id', 'dsh-origin:audit/start:invalid', 'dsh-origin::00000000-0000-0000-0000-000000000000']) {
      expect(submissionOrigin(value)).toBeUndefined()
    }
  })
})
