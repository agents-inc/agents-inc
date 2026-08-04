import { Outlet } from "@tanstack/react-router"

import { NavRail } from "@/components/nav-rail"

// The page scrolls, not the middle column: both side columns are sticky and
// full height, which is what makes their dividers read as continuous rules.
// `items-start` is what lets them be sticky at all.
//
// Desktop-only, with a hard `min-w` below which the page scrolls sideways.
// The route supplies the other two columns, so Docs can span both.
export function RootLayout() {
  return (
    <div className="mx-auto grid max-w-[105.25rem] min-w-[85.25rem] grid-cols-[9.5rem_minmax(43.75rem,1fr)_18.75rem] items-start bg-page">
      <NavRail />
      <Outlet />
    </div>
  )
}

// Docs and Settings are deliberately undesigned — routes exist, content does not.
function Placeholder({ title }: { title: string }) {
  return (
    <main className="col-span-2 grid h-svh place-items-center bg-column">
      <p className="font-mono text-11 font-semibold tracking-[.16em] text-muted-foreground uppercase">
        {title}
      </p>
    </main>
  )
}

export function DocsScreen() {
  return <Placeholder title="Docs" />
}

export function SettingsScreen() {
  return <Placeholder title="Settings" />
}
