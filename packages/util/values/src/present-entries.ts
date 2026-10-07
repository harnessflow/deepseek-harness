/** Stable display ordering and exact identifier omission over immutable source entries. */

/** Produce a display list while preserving the source directory.
 * @param entries - complete source entries.
 * @param identify - stable identifier for each entry.
 * @param order - identifiers to lead the display list, in precedence order.
 * @param hidden - exact identifiers to omit from display.
 * @returns visible entries, preserving source order for equal ranks.
 */
export function presentEntries<T>(
  entries: readonly T[], identify: (entry: T) => string,
  order: readonly string[] = [], hidden: readonly string[] = [],
): T[] {
  const rank = (id: string): number => {
    const index = order.indexOf(id)
    return index === -1 ? order.length : index
  }
  return entries.filter(entry => !hidden.includes(identify(entry)))
    .toSorted((left, right) => rank(identify(left)) - rank(identify(right)))
}
