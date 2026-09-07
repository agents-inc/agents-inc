import { useSyncExternalStore } from "react"

/**
 * THE APP'S ONE VIEWPORT THRESHOLD, AND THE ONLY PLACE THE NUMBER IS WRITTEN.
 *
 * Three things cross it together, and they are one decision rather than three:
 * the skill lattice goes from three columns to four, the stack grid follows it,
 * and each domain tab picks up the `01` index and the skill count it hides
 * below. All three are the same fact about the middle column — under 1500px it
 * is not wide enough for a fourth cell at a readable width, and nine tabs
 * carrying three pieces of text each push their own labels through an ellipsis.
 *
 * A MEDIA QUERY IN JS RATHER THAN IN CSS, AND THE LATTICE IS WHAT FORCES IT.
 * `skill-cell.tsx` flips its options popover to the left in the last column,
 * which it works out as `column === columns - 1` from the cell's index — so the
 * column count has to be a value React can see. A CSS-only `grid-cols-3
 * wide:grid-cols-4` would leave that arithmetic answering for a grid it cannot
 * observe, and every rightmost cell below the threshold would open its panel
 * out through the column's right edge. One mechanism for the whole threshold is
 * what keeps the two halves from disagreeing about where it is.
 *
 * PX RATHER THAN REM, and that is not a style choice: `globals.css` sets the
 * root to 110%, so a `rem` in a declaration and a `rem` in a media query are
 * different lengths — a query resolves against the initial 16px and never
 * against the root's own size.
 */
const WIDE_QUERY = "(min-width: 1500px)"

const wideQuery = () =>
  typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY) : null

// A primitive, so `useSyncExternalStore` can compare snapshots without a cache.
//
// Wide when the environment cannot answer. This is a desktop-only screen whose
// grid carries a hard `min-width`, so the widest drawing is the honest default
// rather than a guess — and it is what a test environment with no `matchMedia`
// gets, which keeps the narrow branch a thing a viewport has to ask for.
const isWide = () => wideQuery()?.matches ?? true

const subscribeToWidth = (notify: () => void) => {
  const query = wideQuery()
  query?.addEventListener("change", notify)
  return () => query?.removeEventListener("change", notify)
}

/** Whether the viewport is at or past the threshold above. */
export function useWideViewport() {
  return useSyncExternalStore(subscribeToWidth, isWide, () => true)
}
