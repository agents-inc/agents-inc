import type { KeyboardEvent } from "react"

const RADIO = '[role="radio"]'

const STEP_BY_KEY: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
}

/**
 * Arrow-key movement for a row of `role="radio"` children, wrapping at both
 * ends with selection following focus — what a native radio group does, and
 * what a roving tabindex owes the keyboard once the row has become one tab stop
 * instead of one per option.
 *
 * The move goes through the option's own `click`, so the caller's `onClick`
 * stays the only place a choice is ever made.
 *
 * SHARED BY THE PACKAGE'S TWO RADIO ROWS rather than written in each. They are
 * the same interaction on two different drawings — `Segmented`'s spaced chips
 * inside the skill options panel, and `ButtonGroup`'s butted cells — and the
 * second copy of this function is how the two would come to disagree about
 * whether the row wraps, or which keys move it.
 */
export function moveToAdjacentRadio(event: KeyboardEvent<HTMLDivElement>) {
  const step = STEP_BY_KEY[event.key]
  if (step === undefined) return

  const options = [...event.currentTarget.querySelectorAll<HTMLElement>(RADIO)]
  const from = options.findIndex((option) => option === event.target)
  if (from === -1) return

  const next = options[(from + step + options.length) % options.length]
  if (!next) return

  event.preventDefault()
  next.focus()
  next.click()
}
