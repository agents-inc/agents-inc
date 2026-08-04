import { Link } from "@tanstack/react-router"

import { CONFIGURE_SEARCH_DEFAULTS } from "@/routes/search"

// Only Configure validates search params, so it is the one link that has to
// supply them; the others would be a type error if they did.
const NAV_ITEMS = [
  { to: "/docs", label: "Docs" },
  { to: "/settings", label: "Settings" },
] as const

const NAV_ITEM_CLASS =
  "font-mono text-11 font-medium tracking-[.07em] whitespace-nowrap uppercase text-muted-foreground hover:text-ink data-[status=active]:font-semibold data-[status=active]:text-ink"

// The official Octocat mark — the design's only icon.
function GitHubMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="block size-[1.0625rem] shrink-0"
      fill="currentColor"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

// Words only — no icons, no cells, no background. The active item is ink and
// semibold; everything else is muted. Sticky and full height so its right
// border reads as one continuous line down the page.
export function NavRail() {
  return (
    <nav className="sticky top-0 flex h-svh flex-col items-end border-r border-divider pt-4 pr-4 pb-6">
      <Link
        to="/"
        search={CONFIGURE_SEARCH_DEFAULTS}
        aria-label="Agents Inc"
        className="flex size-[2.375rem] shrink-0 items-center justify-center border border-brand font-mono text-12 font-semibold tracking-[.02em] text-brand-ink"
      >
        a-i
      </Link>

      <div className="mt-8 flex flex-col items-end gap-[0.6875rem]">
        <Link
          to="/"
          search={CONFIGURE_SEARCH_DEFAULTS}
          activeOptions={{ exact: true }}
          className={NAV_ITEM_CLASS}
        >
          Configure
        </Link>
        {NAV_ITEMS.map((item) => (
          <Link key={item.to} to={item.to} className={NAV_ITEM_CLASS}>
            {item.label}
          </Link>
        ))}
      </div>

      <span className="flex-1" />

      <a
        href="https://github.com/agents-inc"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-[0.4375rem] text-11 text-ink-2 hover:text-ink"
      >
        Github
        <GitHubMark />
      </a>
    </nav>
  )
}
