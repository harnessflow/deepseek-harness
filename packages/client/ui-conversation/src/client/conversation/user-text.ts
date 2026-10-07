/** Pure user-text display contributions; durable content and attachments remain authoritative. */
import { ConversationDefinitionRegistry } from './definition-registry.ts'
import type { UserTextPresentation, UserTextPresentationFace } from '../contract/user-text.ts'
export { EMPTY_USER_TEXT_PRESENTATION, type UserTextInput, type UserTextPresentation, type UserTextPresentationFace } from '../contract/user-text.ts'

/** Caller-owned contributions shared by transcript, local echoes and queues. */
export class UserTextPresentationRegistry extends ConversationDefinitionRegistry<UserTextPresentation> {
  /** Register one display-only contribution for the caller's plugin lifetime.
   * @param definition - uniquely keyed pure presentation function.
   * @returns idempotent disposer.
   */
  register(definition: UserTextPresentation): () => void {
    return this.registerDefinition(definition.key, definition,
      `user text presenter "${definition.key}" is already registered`, `user text: ${definition.key}`)
  }

  /** Bind display reads without capturing a stale session directory.
   * @param cwd - current native session directory reader.
   * @returns observable plain-text presentation face.
   */
  face(cwd: () => string | undefined): UserTextPresentationFace {
    return {
      getSnapshot: () => this.entries(),
      subscribe: listener => this.subscribe(listener),
      present: (text, requestId) => {
        for (const definition of this.entries()) {
          const result = definition.present({ text, requestId, cwd: cwd() })
          if (result !== undefined) return result
        }
        return undefined
      },
    }
  }
}
