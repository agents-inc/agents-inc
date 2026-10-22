import type { KeyboardEvent } from "react"

const ACTIVATION_KEYS = ["Enter", " "]

/**
 * A `role="button"` element's keys: Enter and Space fire a real click, as a native button does, so
 * pointer and keyboard share one handler.
 */
export function activateOnEnterOrSpace(event: KeyboardEvent<HTMLDivElement>) {
  if (!ACTIVATION_KEYS.includes(event.key)) return

  // Space would scroll the dialog otherwise.
  event.preventDefault()
  event.currentTarget.click()
}
