/**
 * Hands `ask`'s answer to `settle` unless the returned cleanup ran first, so an
 * effect drops a late answer to a question it no longer asks. The request
 * itself is left to finish.
 */
export const settleWhileAsked = <T>(
  ask: () => Promise<T>,
  settle: (answer: T) => void
): (() => void) => {
  let asked = true

  void ask().then((answer) => {
    if (asked) settle(answer)
  })

  return () => {
    asked = false
  }
}
