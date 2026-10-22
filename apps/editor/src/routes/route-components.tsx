import { Outlet } from "@tanstack/react-router"
import { Toaster } from "@workspace/ui/components/toast"
import { cn } from "@workspace/ui/lib/utils"

import { NavRail } from "@/components/nav-rail"
import { toastManager } from "@/lib/toast"

// One string for the page and the toast layer, so the layer's columns land on
// the page's at any width.
const PAGE_COLUMNS =
  "mx-auto grid max-w-[105.25rem] min-w-[68.1818rem] grid-cols-[7rem_minmax(43.75rem,1fr)_18.75rem]"

// The page scrolls, not the middle column, so the sticky side columns' dividers
// stay continuous. Centred past its max width, so align with `sticky`, never
// `position: fixed` — except a layer that repeats `PAGE_COLUMNS`, as the
// toasts' does, so they stay on screen as the page scrolls.
export function RootLayout() {
  return (
    <>
      <div className={cn(PAGE_COLUMNS, "items-start bg-page")}>
        {/* No visible page title, so the h1 is sr-only, in a landmark. */}
        <header className="sr-only">
          <h1>Agents Inc</h1>
        </header>
        <NavRail />
        <Outlet />
      </div>
      {/* Below whatever bar is pinned to the top (`useScrollClearance`), so a
          toast never covers it. Presses pass through everywhere but the
          toasts themselves. */}
      <div className="pointer-events-none fixed inset-x-0 top-[var(--scroll-clearance-top,0px)] z-[150]">
        <div className={PAGE_COLUMNS}>
          <Toaster
            manager={toastManager}
            className="pointer-events-auto col-start-2 mt-3 mr-gutter justify-self-end"
          />
        </div>
      </div>
    </>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <main className="col-span-2 grid h-svh place-items-center bg-column">
      <p className="font-mono text-11 font-semibold tracking-[.16em] text-muted-foreground uppercase">
        {title}
      </p>
    </main>
  )
}

export function SettingsScreen() {
  return <Placeholder title="Settings" />
}
