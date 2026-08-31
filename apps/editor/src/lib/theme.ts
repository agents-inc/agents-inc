import { useEffect, useSyncExternalStore } from "react"

import { useUiStore } from "@/stores/ui-store"

/**
 * WHICH PALETTE THE APP IS PAINTED IN, and the one control that changes it.
 *
 * Three states, not two. `packages/ui` publishes the palette twice — once under
 * `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`,
 * and once under `[data-theme="dark"]` — so the stylesheet already answers all
 * three: no attribute means "follow the machine", and either attribute beats it
 * in that direction. What this adds is the choice, not the painting.
 *
 * WHICH IS WHY `system` IS STORED RATHER THAN RESOLVED. Writing `light` on
 * mount because the machine happened to be light would freeze a preference the
 * visitor never expressed, and stop tracking a machine that later changes its
 * mind — at dusk, on every laptop with a schedule.
 */

const DARK_QUERY = "(prefers-color-scheme: dark)"

// The attribute `tokens.css` switches on, and the only thing written here.
const THEME_ATTRIBUTE = "data-theme"

export type Theme = "light" | "dark"

const darkQuery = () =>
  typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null

// What the machine is asking for right now. A primitive, so
// `useSyncExternalStore` can compare snapshots without a cache.
const systemTheme = (): Theme => (darkQuery()?.matches ? "dark" : "light")

const subscribeToSystem = (notify: () => void) => {
  const query = darkQuery()
  query?.addEventListener("change", notify)
  return () => query?.removeEventListener("change", notify)
}

/**
 * The theme showing, and the way to the other one.
 *
 * `flip` is derived from what is ON SCREEN rather than from what is stored,
 * which is the whole reason this is a hook and not a store action: pressing the
 * glyph while the preference is `system` has to name the opposite of what the
 * machine is currently painting, and only this side can see that.
 */
export function useTheme() {
  const preference = useUiStore((state) => state.theme)
  const setTheme = useUiStore((state) => state.setTheme)

  const system = useSyncExternalStore(
    subscribeToSystem,
    systemTheme,
    () => "light" as const
  )
  const theme: Theme = preference === "system" ? system : preference

  useEffect(() => {
    const root = document.documentElement
    if (preference === "system") root.removeAttribute(THEME_ATTRIBUTE)
    else root.setAttribute(THEME_ATTRIBUTE, preference)
  }, [preference])

  return {
    theme,
    flip: () => setTheme(theme === "dark" ? "light" : "dark"),
  }
}
