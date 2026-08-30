import { Outlet } from "@tanstack/react-router"

import { NavRail } from "@/components/nav-rail"

// The page scrolls, not the middle column: both side columns are sticky and
// full height, which is what makes their dividers read as continuous rules.
// `items-start` is what lets them be sticky at all.
//
// Desktop-only, with a hard `min-w` below which the page scrolls sideways.
// The route supplies the other two columns, so Docs can span both.
//
// `mx-auto max-w-*` is why `position: fixed` is unusable for anything that has
// to line up with this grid: past the max width the grid stops filling the
// window and starts being centred in it, so every column slides right as the
// window widens while a viewport-measured offset stays put. Use `sticky` inside
// the column the control belongs to. See `e2e/README.md` under Conventions.
export function RootLayout() {
  return (
    <div className="mx-auto grid max-w-[105.25rem] min-w-[85.25rem] grid-cols-[9.5rem_minmax(43.75rem,1fr)_18.75rem] items-start bg-page">
      {/* The document's one heading, and the shell is where it has to live:
          the design opens straight onto the grid and draws no page title at
          all, on any route, so there is no visible element for the name to be.
          `sr-only` states it for the reader who asks the page what it is —
          which is what axe's `page-has-heading-one` is about — and changes
          nothing for the reader who can see it.

          The APP rather than the screen, and one level above the `h2` each
          domain section draws. A per-route title would mean a second copy of
          the route table here, going quietly wrong the next time a route is
          added; this cannot.

          Inside a `<header>` because every landmark rule is a rule about ALL
          of the page: a heading loose in the grid is content belonging to no
          landmark, which axe reports as `region` the moment the h1 that
          silenced `page-has-heading-one` arrives. */}
      <header className="sr-only">
        <h1>Agents Inc</h1>
      </header>
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
