import { Outlet } from "@tanstack/react-router"

import { NavRail } from "@/components/nav-rail"

// The page scrolls, not the middle column, so the sticky side columns' dividers
// stay continuous. Centred past its max width, so align with `sticky`, never
// `position: fixed`.
export function RootLayout() {
  return (
    <div className="mx-auto grid max-w-[105.25rem] min-w-[68.1818rem] grid-cols-[7rem_minmax(43.75rem,1fr)_18.75rem] items-start bg-page">
      {/* No visible page title, so the h1 is sr-only, in a landmark. */}
      <header className="sr-only">
        <h1>Agents Inc</h1>
      </header>
      <NavRail />
      <Outlet />
    </div>
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
