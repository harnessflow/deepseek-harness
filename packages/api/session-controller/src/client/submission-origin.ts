/** Optional display origin encoded in an otherwise opaque unique prompt identity. */
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SessionRequestId } from '../types.ts'

const ORIGIN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/u
const PREFIX = 'dsh-origin:'

/** Mint a complete correlation identity; origin grants no identity or permission.
 * @param origin - optional display namespace.
 * @returns random unique request identity, unchanged UUID format without an origin.
 */
export function createSubmissionRequestId(origin?: string): SessionRequestId {
  if (origin !== undefined && !ORIGIN.test(origin)) throw new Error('invalid submission origin')
  const uuid = randomUUID()
  return (origin === undefined ? uuid : `${PREFIX}${origin}:${uuid}`) as SessionRequestId
}

/** Read only recognized display namespaces; callers must still inspect original content.
 * @param requestId - full native correlation identity from echo or persisted source.rpcId.
 * @returns namespace, or undefined for legacy and unknown identifier formats.
 */
export function submissionOrigin(requestId: string | undefined): string | undefined {
  if (requestId === undefined || !requestId.startsWith(PREFIX)) return undefined
  const tail = requestId.slice(PREFIX.length)
  const separator = tail.lastIndexOf(':')
  const origin = tail.slice(0, separator)
  const uuid = tail.slice(separator + 1)
  return ORIGIN.test(origin) && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(uuid)
    ? origin : undefined
}
