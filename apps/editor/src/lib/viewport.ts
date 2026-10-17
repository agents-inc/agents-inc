import { useSyncExternalStore } from "react"

/**
 * The app's one viewport threshold: the lattice and stack grid gain a column,
 * tabs gain counts. In JS because skill-cell.tsx computes the last column; px
 * because a media query's rem ignores the 110% root.
 */
const WIDE_QUERY = "(min-width: 1500px)"

const wideQuery = () =>
  typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY) : null

// A primitive for `useSyncExternalStore`; wide without matchMedia (desktop-only
// screen).
const isWide = () => wideQuery()?.matches ?? true

const subscribeToWidth = (notify: () => void) => {
  const query = wideQuery()
  query?.addEventListener("change", notify)
  return () => query?.removeEventListener("change", notify)
}

export function useWideViewport() {
  return useSyncExternalStore(subscribeToWidth, isWide, () => true)
}
