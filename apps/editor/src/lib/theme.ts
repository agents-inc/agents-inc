import { useEffect, useSyncExternalStore } from "react"

import { useUiStore } from "@/stores/ui-store"

/**
 * `system` is stored rather than resolved, so the app keeps following the
 * machine. The stylesheet already paints all three states off `data-theme`.
 */

const DARK_QUERY = "(prefers-color-scheme: dark)"

const THEME_ATTRIBUTE = "data-theme"

export type Theme = "light" | "dark"

const darkQuery = () =>
  typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null

// A primitive, so `useSyncExternalStore` needs no snapshot cache.
const systemTheme = (): Theme => (darkQuery()?.matches ? "dark" : "light")

const subscribeToSystem = (notify: () => void) => {
  const query = darkQuery()
  query?.addEventListener("change", notify)
  return () => query?.removeEventListener("change", notify)
}

/** `flip` reads what is on screen, which only a hook can see under `system`. */
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
