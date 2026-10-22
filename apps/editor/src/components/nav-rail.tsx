import { Link } from "@tanstack/react-router"
import { Glyph } from "@workspace/ui/components/glyph"
import { useEffect, useState } from "react"

import {
  signIn,
  signOut,
  type AuthRefusal,
  type AuthResult,
} from "@/lib/api/auth"
import { useTheme } from "@/lib/theme"
import { CONFIGURE_SEARCH_DEFAULTS } from "@/routes/search"
import { useAccountStore } from "@/stores/account-store"
import { useCatalogStore } from "@/stores/catalog-store"
import { useMarketplaceStore } from "@/stores/marketplace-store"
import { useUiStore } from "@/stores/ui-store"

// The active field is bled: padding against an equal negative margin, so no
// neighbour moves.
const NAV_ITEM_ACTIVE_FIELD =
  "data-[status=active]:-my-[0.1875rem] data-[status=active]:-mr-rail-pad data-[status=active]:bg-wash data-[status=active]:py-[0.1875rem] data-[status=active]:pr-rail-pad data-[status=active]:pl-2.5 data-[status=active]:text-brand-ink"

const NAV_ITEM_CLASS =
  "font-mono text-11 font-medium tracking-[.07em] whitespace-nowrap uppercase text-muted-foreground hover:text-ink " +
  NAV_ITEM_ACTIVE_FIELD

const SECTION_TEXT_CLASS =
  "font-mono text-9 font-medium tracking-[.07em] whitespace-nowrap uppercase"

const RAIL_CONTROL_CLASS =
  "cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring"

// `truncate` needs a bounded ancestor; a marketplace ref is arbitrary length.
const BOUNDED_CLASS = "max-w-full min-w-0"
const TRUNCATED_TEXT_CLASS = `${BOUNDED_CLASS} truncate`

// Shared by both lower sections, so they stay aligned. The negative margin is
// the padding token.
const RAIL_SECTION_CLASS =
  "-mr-rail-pad flex flex-col items-end self-stretch pt-3.5 pr-rail-pad"

// Only the marketplace section has the rule, so the rule and its margin live
// apart from the box.
const RAIL_RULE_CLASS =
  "relative mt-[1.125rem] before:absolute before:top-0 before:right-0 before:h-px before:w-[70%] before:bg-divider before:content-['']"

// `display`, not opacity, so the swap does not reserve space for both.
const SWAP_OUT = "group-hover:hidden group-focus-visible:hidden"
const SWAP_IN = "hidden group-hover:inline group-focus-visible:inline"

/**
 * Other Workers on the same origin: a `<Link>` would get the /editor basepath
 * and silently match nothing, so these are plain anchors.
 */
const SITE_LINKS = [
  { href: "/docs/why", label: "About" },
  { href: "/docs", label: "Docs" },
] as const

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

const THEME_GLYPH_SIZE = 16

function ThemeToggle() {
  const { theme, flip } = useTheme()
  const next = theme === "dark" ? "light" : "dark"

  return (
    <button
      type="button"
      data-slot="theme-toggle"
      aria-label={`Switch to ${next} theme`}
      title={`${theme} — switch to ${next}`}
      onClick={flip}
      className="flex size-[1.0625rem] shrink-0 items-center justify-center text-muted-foreground outline-none hover:text-ink focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Glyph name={theme === "dark" ? "moon" : "sun"} size={THEME_GLYPH_SIZE} />
    </button>
  )
}

// Keyed by action as well as refusal, so a refused sign-out does not say
// sign-in.
type AuthAction = "sign-in" | "sign-out"

type Attempt = { action: AuthAction; refusal: AuthRefusal }

const attemptOf = (action: AuthAction, result: AuthResult): Attempt | null =>
  result.ok ? null : { action, refusal: result.refusal }

const REFUSAL_COPY: Record<AuthAction, Record<AuthRefusal, string>> = {
  "sign-in": {
    "too-many": "Too many tries — wait a minute",
    refused: "Sign-in was refused",
    unreachable: "Could not reach sign-in",
  },
  "sign-out": {
    "too-many": "Too many tries — wait a minute",
    refused: "Sign-out was refused",
    unreachable: "Could not reach sign-out",
  },
}

function Marketplace() {
  const setDialog = useUiStore((state) => state.setDialog)
  const marketplace = useCatalogStore((state) => state.marketplace)

  return (
    <div
      data-slot="marketplace-row"
      className={`${RAIL_SECTION_CLASS} ${RAIL_RULE_CLASS}`}
    >
      <button
        type="button"
        onClick={() => setDialog("marketplace")}
        className={`${RAIL_CONTROL_CLASS} ${BOUNDED_CLASS} group flex flex-col items-end gap-[0.1875rem]`}
      >
        <span
          className={`${SECTION_TEXT_CLASS} text-muted-foreground group-hover:text-ink`}
        >
          Marketplace
        </span>
        {/* The empty marketplace is the public catalogue: no name. */}
        {marketplace && (
          <span
            data-slot="marketplace-name"
            className={`${SECTION_TEXT_CLASS} ${TRUNCATED_TEXT_CLASS} text-ink`}
          >
            {marketplace}
          </span>
        )}
      </button>
      <MarketplaceSwitcher />
    </div>
  )
}

/**
 * Lists saved marketplaces only, never one a link brought; absent below two.
 */
function MarketplaceSwitcher() {
  const saved = useMarketplaceStore((state) => state.saved)
  const current = useMarketplaceStore((state) => state.current)
  const requestMarketplace = useUiStore((state) => state.requestMarketplace)

  const refs = Object.keys(saved)
  if (refs.length <= 1) return null

  const others = refs.filter((marketplace) => marketplace !== current)

  return (
    <div
      role="group"
      aria-label="Saved marketplaces"
      className={`${BOUNDED_CLASS} mt-[0.4375rem] flex flex-col items-end gap-[0.4375rem]`}
    >
      {others.map((marketplace) => (
        <button
          key={marketplace}
          type="button"
          aria-label={`Switch to ${marketplace}`}
          onClick={() => requestMarketplace(marketplace)}
          className={`${SECTION_TEXT_CLASS} ${RAIL_CONTROL_CLASS} ${TRUNCATED_TEXT_CLASS} text-muted-foreground hover:text-ink`}
        >
          {marketplace}
        </button>
      ))}
    </div>
  )
}

// The row draws nothing until the session is known, so a signed-in visitor
// never sees "Sign in".
function Account() {
  const session = useAccountStore((state) => state.session)
  const ready = useAccountStore((state) => state.ready)
  const refresh = useAccountStore((state) => state.refresh)
  const [attempt, setAttempt] = useState<Attempt | null>(null)

  useEffect(() => void refresh(), [refresh])

  return (
    <div data-slot="account-row" className={RAIL_SECTION_CLASS}>
      {!ready ? null : (
        <AccountRow
          name={session?.user.name ?? null}
          attempt={attempt}
          onAttempt={setAttempt}
          onRefresh={refresh}
        />
      )}
    </div>
  )
}

function RefusalLine({ attempt }: { attempt: Attempt }) {
  return (
    <span
      role="alert"
      className={`${SECTION_TEXT_CLASS} mb-[0.4375rem] max-w-[9rem] text-right text-wrap text-muted-foreground`}
    >
      {REFUSAL_COPY[attempt.action][attempt.refusal]}
    </span>
  )
}

function SignIn({
  onAttempt,
}: {
  onAttempt: (attempt: Attempt | null) => void
}) {
  const enter = async () => onAttempt(attemptOf("sign-in", await signIn()))

  return (
    <button
      type="button"
      onClick={() => void enter()}
      className={`${RAIL_CONTROL_CLASS} group flex items-center gap-[0.4375rem]`}
    >
      <span
        aria-hidden
        className="size-[0.3125rem] shrink-0 shadow-[inset_0_0_0_1px_var(--color-line-hover)]"
      />
      <span
        className={`${SECTION_TEXT_CLASS} text-muted-foreground group-hover:text-ink`}
      >
        Sign in
      </span>
    </button>
  )
}

// The visible text is the name; the accessible name is the action.
function SignedIn({
  name,
  onAttempt,
  onRefresh,
}: {
  name: string
  onAttempt: (attempt: Attempt | null) => void
  onRefresh: () => Promise<void>
}) {
  const leave = async () => {
    onAttempt(attemptOf("sign-out", await signOut()))
    await onRefresh()
  }

  return (
    <button
      type="button"
      aria-label="Sign out"
      onClick={() => void leave()}
      className={`${RAIL_CONTROL_CLASS} ${BOUNDED_CLASS} group flex items-center gap-[0.4375rem]`}
    >
      <span
        aria-hidden
        className={`size-[0.3125rem] shrink-0 bg-signed-in ${SWAP_OUT}`}
      />
      <span
        data-slot="account-name"
        className={`${SECTION_TEXT_CLASS} min-w-0 truncate text-muted-foreground ${SWAP_OUT}`}
      >
        {name}
      </span>
      <span className={`${SECTION_TEXT_CLASS} text-brand-ink ${SWAP_IN}`}>
        Sign out
      </span>
    </button>
  )
}

function AccountRow({
  name,
  attempt,
  onAttempt,
  onRefresh,
}: {
  name: string | null
  attempt: Attempt | null
  onAttempt: (attempt: Attempt | null) => void
  onRefresh: () => Promise<void>
}) {
  return (
    <>
      {attempt && <RefusalLine attempt={attempt} />}
      <div className={`relative ${BOUNDED_CLASS}`}>
        {name === null ? (
          <SignIn onAttempt={onAttempt} />
        ) : (
          <SignedIn name={name} onAttempt={onAttempt} onRefresh={onRefresh} />
        )}
      </div>
    </>
  )
}

export function NavRail() {
  return (
    <nav className="sticky top-0 flex h-svh flex-col items-end border-r border-divider pt-4 pr-rail-pad pb-6">
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
          activeOptions={{ exact: true, includeSearch: false }}
          className={NAV_ITEM_CLASS}
        >
          Editor
        </Link>
        {SITE_LINKS.map((item) => (
          <a key={item.href} href={item.href} className={NAV_ITEM_CLASS}>
            {item.label}
          </a>
        ))}
      </div>

      <Marketplace />

      <Account />

      <span className="flex-1" />

      <div className="flex items-center justify-end gap-[0.6875rem] self-stretch">
        <ThemeToggle />
        <a
          href="https://github.com/agents-inc"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          className="flex text-ink-2 hover:text-ink"
        >
          <GitHubMark />
        </a>
      </div>
    </nav>
  )
}
