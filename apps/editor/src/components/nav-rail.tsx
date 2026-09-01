import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { signIn, signOut, type AuthRefusal } from "@/lib/api/auth"
import { useTheme } from "@/lib/theme"
import { CONFIGURE_SEARCH_DEFAULTS } from "@/routes/search"
import { useAccountStore } from "@/stores/account-store"

// Only Configure validates search params, so it is the one link that has to
// supply them; the others would be a type error if they did.
const NAV_ITEM_CLASS =
  "font-mono text-11 font-medium tracking-[.07em] whitespace-nowrap uppercase text-muted-foreground hover:text-ink data-[status=active]:font-semibold data-[status=active]:text-ink"

// The account row's own type, one step smaller than the nav words. It is not
// navigation, and the size is what says so without a box around it.
const ACCOUNT_TEXT_CLASS =
  "font-mono text-9 font-medium tracking-[.07em] whitespace-nowrap uppercase"

// Hover — and focus, which the design has no path for and a keyboard needs —
// replaces the dot and the name with the verb. `display` rather than opacity,
// because the swap must not reserve space for both.
const SWAP_OUT = "group-hover:hidden group-focus-visible:hidden"
const SWAP_IN = "hidden group-hover:inline group-focus-visible:inline"

// Router links, and only router links. `/settings` is the sole nav word left
// that this Worker actually serves — `/docs` moved out of the app entirely when
// the apex was split, and is an ordinary anchor below.
const NAV_ITEMS = [{ to: "/settings", label: "Settings" }] as const

/**
 * THE TWO DESTINATIONS THAT ARE NOT THIS APP, and the reason they are `<a>` and
 * never `<Link>`.
 *
 * Since the split, `agentsinc.sh/` is the landing page and `agentsinc.sh/docs`
 * is Starlight — both on the `agents-inc-www` Worker, while this app is on
 * `agents-inc-editor` behind the Route `agentsinc.sh/editor*`. Crossing that
 * boundary is a document load, not a client-side navigation.
 *
 * A `<Link to="/docs">` here would NOT fail loudly. The router's basepath would
 * rewrite it to `/editor/docs`, which this app no longer has a route for — so
 * the visitor gets a blank match instead of the documentation, silently. Plain
 * anchors are the only spelling that leaves the prefix alone, because `<Link>`
 * routes even a raw `href` through the same rewrite.
 */
const SITE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/docs", label: "Docs" },
] as const

// The official Octocat mark — and, since 107h, the whole of the link: no
// "GitHub" label at any width.
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

// Lucide geometry, 1.75 stroke, round caps and joins, drawn at 16px in a 17px
// box so both footer glyphs sit on one baseline.
const GLYPH_CLASS = "size-4"
const GLYPH_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: GLYPH_CLASS,
} as const

function SunGlyph() {
  return (
    <svg {...GLYPH_PROPS}>
      <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7 4.9 19.1M19.1 4.9l-1.4 1.4" />
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
    </svg>
  )
}

function MoonGlyph() {
  return (
    <svg {...GLYPH_PROPS}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  )
}

/**
 * ONE GLYPH, SHOWING THE THEME YOU ARE IN. Pressing it flips.
 *
 * A two-cell sun/moon track and a sliding 26×14 switch were both built and
 * rejected: a track shows a state you are not in, and there are only two
 * states, so the icon you can see IS the state. The name says the ACTION,
 * because that is what a control is for; the title carries the design's own
 * phrasing, which names both halves.
 */
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
      {theme === "dark" ? <MoonGlyph /> : <SunGlyph />}
    </button>
  )
}

// What a refused attempt says, in the rail's own voice. Words rather than a
// code for the same reason `ShareRefusal` has three members: these are three
// situations for the person at the keyboard, and only one of them is worth
// waiting out. The rate-limit window lives in `apps/server/src/auth.ts` and is
// deliberately not restated here.
//
// Keyed by ACTION as well as by refusal, and that is the half this was missing.
// One map served both buttons while every string in it named sign-in, so a
// refused SIGN-OUT reported "Sign-in was refused" — a message that sends the
// reader to the wrong half of the system, and did: it read as a sign-in problem,
// then as a stale build, while the actual defect was a sign-out request the
// worker answered 415. `AuthRefusal`'s own docblock says it covers "a click on
// Sign in or Sign out"; the copy never followed.
type AuthAction = "sign-in" | "sign-out"

type Attempt = { action: AuthAction; refusal: AuthRefusal }

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

// The account, under the nav words it qualifies rather than pinned to the foot
// of the rail. Words only, like everything else here — no border, no fill, no
// caret and no menu. A bordered pill borrows the filter chips' border, which
// means "filter" everywhere else in the app; a recessed field is still a
// container, which was the objection; and a dropdown contradicts a trigger that
// says "sign out" the moment you point at it. All three were built and removed.
//
// The ROW draws nothing until the session has been asked for. The alternative
// is showing "Sign in" for the moment before the answer arrives, which reads as
// signed-out to somebody who is signed in — a flash that says the wrong thing
// is worse than a gap that says nothing.
function Account() {
  const session = useAccountStore((state) => state.session)
  const ready = useAccountStore((state) => state.ready)
  const refresh = useAccountStore((state) => state.refresh)
  // A refusal has somewhere to go, which is the whole reason `signIn` returns
  // one. Before this the rail called `void signIn()` and dropped it: the
  // client stopped throwing, the reporting sink heard about it, and the person
  // looking at the button saw nothing happen at all.
  const [attempt, setAttempt] = useState<Attempt | null>(null)

  useEffect(() => void refresh(), [refresh])

  // The RULE stays whatever the session turns out to be — it is the rail's one
  // horizontal line and it separates identity from navigation, which is true
  // before the answer arrives as well as after. Only the row inside it waits.
  //
  // 70% of the rail's width, pinned right, so it ends flush on the vertical
  // divider rather than running the full width of a column whose content is
  // right-aligned. The negative margin is the rail's own padding token and
  // never its value: three separate bugs in this design came from writing the
  // number out.
  return (
    <div
      data-slot="account-row"
      className="relative mt-[1.125rem] -mr-rail-pad flex flex-col items-end self-stretch pt-3.5 pr-rail-pad before:absolute before:top-0 before:right-0 before:h-px before:w-[70%] before:bg-divider before:content-['']"
    >
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

// The one thing a refused attempt leaves behind. Right-aligned like everything
// else in the rail, and `alert` rather than `status` because it interrupts
// something the person just asked for.
function RefusalLine({ attempt }: { attempt: Attempt }) {
  return (
    <span
      role="alert"
      className={`${ACCOUNT_TEXT_CLASS} mb-[0.4375rem] max-w-[9rem] text-right text-wrap text-muted-foreground`}
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
  return (
    <button
      type="button"
      onClick={() =>
        void signIn().then((result) =>
          onAttempt(
            result.ok ? null : { action: "sign-in", refusal: result.refusal }
          )
        )
      }
      className="group flex cursor-pointer items-center gap-[0.4375rem] outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {/* Hollow, and the one state that is not the green fill. */}
      <span
        aria-hidden
        className="size-[0.3125rem] shrink-0 shadow-[inset_0_0_0_1px_var(--color-line-hover)]"
      />
      <span
        className={`${ACCOUNT_TEXT_CLASS} text-muted-foreground group-hover:text-ink`}
      >
        Sign in
      </span>
    </button>
  )
}

// The name is the LABEL and signing out is the ACTION, so the accessible name
// is the verb: the visible text says who you are and the hover says what
// pressing it does, and only one of those can be the name.
function SignedIn({
  name,
  onAttempt,
  onRefresh,
}: {
  name: string
  onAttempt: (attempt: Attempt | null) => void
  onRefresh: () => Promise<void>
}) {
  return (
    <button
      type="button"
      aria-label="Sign out"
      onClick={() =>
        void signOut().then((result) => {
          onAttempt(
            result.ok ? null : { action: "sign-out", refusal: result.refusal }
          )
          return onRefresh()
        })
      }
      className="group flex max-w-full min-w-0 cursor-pointer items-center gap-[0.4375rem] outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className={`size-[0.3125rem] shrink-0 bg-signed-in ${SWAP_OUT}`}
      />
      <span
        data-slot="account-name"
        className={`${ACCOUNT_TEXT_CLASS} min-w-0 truncate text-muted-foreground ${SWAP_OUT}`}
      >
        {name}
      </span>
      {/* Amber, because it is the one thing on this row that is not the state
          you are in — it is the state you are asking for. */}
      <span className={`${ACCOUNT_TEXT_CLASS} text-brand-ink ${SWAP_IN}`}>
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
      {/* `.acctw` — the bound the ellipsis needs. `min-w-0` and the truncation
          on the name alone do nothing unless an ancestor bounds the width:
          without this, `vincent.mendes` grows the row leftward off the viewport
          and the dot ends up at x = −26. */}
      <div className="relative max-w-full min-w-0">
        {name === null ? (
          <SignIn onAttempt={onAttempt} />
        ) : (
          <SignedIn name={name} onAttempt={onAttempt} onRefresh={onRefresh} />
        )}
      </div>
    </>
  )
}

// Words only — no icons, no cells, no background. The active item is ink and
// semibold; everything else is muted. Sticky and full height so its right
// border reads as one continuous line down the page.
//
// FIVE CHILDREN, IN THIS ORDER: logo, nav words, the account and its rule, the
// spacer, the footer row. The account used to sit under the spacer, which put
// it on the same footing as an outbound link to GitHub; it belongs with the
// navigation it qualifies, and the footer belongs to the two glyphs that are
// not navigation at all — the theme, then the mark.
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
        {SITE_LINKS.map((item) => (
          <a key={item.href} href={item.href} className={NAV_ITEM_CLASS}>
            {item.label}
          </a>
        ))}
      </div>

      <Account />

      <span className="flex-1" />

      {/* Both glyphs on one baseline, 11px apart, ending on the same content
          edge as the nav words and the account row. */}
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
