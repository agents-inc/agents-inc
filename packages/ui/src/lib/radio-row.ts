import type { KeyboardEvent } from "react"

const RADIO = '[role="radio"]'

const STEP_BY_KEY: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
}

/**
 * Roving radio row: arrows wrap and selection follows focus. Moves through the option's `click`, so
 * `onClick` stays the only place a choice is made. Shared by `Segmented` and `ButtonGroup`.
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
