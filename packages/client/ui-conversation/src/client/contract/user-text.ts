/** Original text and display context; requestId is correlation data, never authority. */
export interface UserTextInput {
  readonly text: string
  readonly requestId?: string | undefined
  readonly cwd?: string | undefined
}

/** A contribution returns a plain display string or delegates by returning undefined. */
export interface UserTextPresentation {
  readonly key: string
  readonly present: (input: UserTextInput) => string | undefined
}

/** Observable display-only face bound to one session's current working directory. */
export interface UserTextPresentationFace {
  readonly getSnapshot: () => readonly UserTextPresentation[]
  readonly subscribe: (listener: () => void) => () => void
  readonly present: (text: string, requestId?: string) => string | undefined
}

/** Stable absent face for consumers rendered without optional contributions. */
export const EMPTY_USER_TEXT_PRESENTATION: UserTextPresentationFace = {
  getSnapshot: () => EMPTY,
  subscribe: () => () => {},
  present: () => undefined,
}
const EMPTY: readonly UserTextPresentation[] = []
