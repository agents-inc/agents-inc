import { Link } from "@tanstack/react-router"
import { Glyph } from "@workspace/ui/components/glyph"
import { useEffect, useState } from "react"

import { signIn, signOut, type AuthRefusal } from "@/lib/api/auth"
import { useTheme } from "@/lib/theme"
import { CONFIGURE_SEARCH_DEFAULTS } from "@/routes/search"
import { useAccountStore } from "@/stores/account-store"
import { useCatalogStore } from "@/stores/catalog-store"
import { useMarketplaceStore } from "@/stores/marketplace-store"
import { useUiStore } from "@/stores/ui-store"

// Only Editor validates search params, so it is the one link that has to
// supply them; the others would be a type error if they did.
// THE ACTIVE ITEM IS AN AMBER FIELD BLED TO THE DIVIDER, and both halves of
// that are load-bearing.
//
// Amber, because amber in this design means "not the default" — what the
// visitor deliberately chose — and the page you are on is the one you chose.
// It replaces a bold black word, which spent the rail's only weight step on
// the one thing colour could say on its own.
//
// Bled, because the field is drawn by a padding and an equal NEGATIVE MARGIN,
// so it paints larger without moving a single neighbour — the rail's 11px
// rhythm is untouched between the active item and the words around it. Only
// the INNER side is padded; the outer side runs to the rail's own right
// padding, so the field ends exactly where the divider begins instead of
// overhanging the content edge. `--spacing-rail-pad` is that padding and the
// only place the number appears, so both sides move together at every width.
// The field itself, kept apart from the word's own type so the geometry reads
// as one thing rather than as six prefixed utilities in a sentence about fonts.
// Every declaration here is paired: 3px of padding against 3px of negative
// margin on the block axis, and the rail's own padding against the negative of
// it on the inline axis.
const NAV_ITEM_ACTIVE_FIELD =
  "data-[status=active]:-my-[0.1875rem] data-[status=active]:-mr-rail-pad data-[status=active]:bg-wash data-[status=active]:py-[0.1875rem] data-[status=active]:pr-rail-pad data-[status=active]:pl-2.5 data-[status=active]:text-brand-ink"

const NAV_ITEM_CLASS =
  "font-mono text-11 font-medium tracking-[.07em] whitespace-nowrap uppercase text-muted-foreground hover:text-ink " +
  NAV_ITEM_ACTIVE_FIELD

// The type the rail's two lower sections are set in, one step smaller than the
// nav words. Neither of them is navigation, and the size is what says so
// without a box around it.
//
// It was `ACCOUNT_TEXT_CLASS` while the account was the only section wearing
// it. The name is the section rather than the account now, because a constant
// naming one of its two callers is the drift every other comment in this file
// is about.
const SECTION_TEXT_CLASS =
  "font-mono text-9 font-medium tracking-[.07em] whitespace-nowrap uppercase"

// A words-only control in this column: no box, no fill, and a focus ring
// because the design has no path for a keyboard and one needs a visible one.
const RAIL_CONTROL_CLASS =
  "cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring"

// The bound truncation actually needs, and the truncation itself. `truncate`
// alone does nothing unless an ancestor caps the width — the same thing the
// account row's `.acctw` wrapper buys the name inside it. A marketplace ref is
// arbitrary length and this column is 9.5rem, so the control wears the bound
// and every text node inside it wears both.
const BOUNDED_CLASS = "max-w-full min-w-0"
const TRUNCATED_TEXT_CLASS = `${BOUNDED_CLASS} truncate`

// The BOX both lower sections sit in: right-aligned, and ending flush on the
// vertical divider rather than on the column's own padding. The negative margin
// is the rail's own padding token and never its value: three separate bugs in
// this design came from writing the number out.
//
// Still SHARED, because the box is still common to both — the top inset, the
// padding and the right-aligned column are what make the two sections read as
// one block. Two byte-identical class strings is the shape a treatment drifts
// out of: a change lands on one of them, nothing is red, and the two sections
// stop agreeing about where their content sits.
//
// The `mt` that used to open this string has gone to the rule below, and that
// is the second half of the same removal: the air above a section was here
// because both sections wanted it, and the owner had it off the account row on
// 2026-09-05. What remains — `pt-3.5` — is the one value between the two
// sections now, so a change to it moves them together, which is the whole
// reason this constant is shared.
//
// It stays even though the account row has no rule for it to clear, and that
// is a decision rather than an oversight. Taking it as well puts the two boxes
// and their contents flush: nothing between the sections but the line box,
// which is tighter than the `gap-[0.6875rem]` between two nav words above —
// and `Account` below says the spacing IS the whole of what sets the two
// sections apart, so at zero there is nothing left doing that job.
const RAIL_SECTION_CLASS =
  "-mr-rail-pad flex flex-col items-end self-stretch pt-3.5 pr-rail-pad"

// The hairline above a section, THE AIR ABOVE THE HAIRLINE, and the rail's ONE
// horizontal rule. The marketplace section wears all of it and the account
// section wears none, which is why this is split off the box above rather than
// living in it: what the two sections share is the box, and the rule is the one
// thing they no longer have in common.
//
// The margin travels WITH the rule rather than staying in the box, because its
// only job is holding the rule off the nav words — a section with no rule has
// nothing up there to be held off. Leaving it in the box and cancelling it with
// an `mt-0` at the account's call site would have left the shared constant
// claiming spacing half its callers immediately reject, which the next section
// added to this rail would inherit.
//
// It separates the pair from the nav words above them. The account row carried
// a second copy — a rule between marketplace and account — until the owner
// removed it: the two are one block under the navigation, not two things being
// told apart.
//
// 70% of the rail's width, pinned right, so the rule ends on the vertical
// divider rather than running the full width of a column whose content is
// right-aligned. `relative` belongs here and not in the box, because the only
// thing it positions is this rule.
const RAIL_RULE_CLASS =
  "relative mt-[1.125rem] before:absolute before:top-0 before:right-0 before:h-px before:w-[70%] before:bg-divider before:content-['']"

// Hover — and focus, which the design has no path for and a keyboard needs —
// replaces the dot and the name with the verb. `display` rather than opacity,
// because the swap must not reserve space for both.
const SWAP_OUT = "group-hover:hidden group-focus-visible:hidden"
const SWAP_IN = "hidden group-hover:inline group-focus-visible:inline"

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
  // ABOUT rather than Home, and the word names the destination instead of a
  // position. This is an `<a>` to the `agents-inc-www` Worker's root, while the
  // `a-i` logo directly above it is a `<Link>` to this app's own root — two
  // controls that both said "home" and meant different places.
  { href: "/", label: "About" },
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

// Both theme glyphs come from the shared set, at 16px in a 17px box so they sit
// on one baseline with the GitHub mark. They used to be drawn here at ROUND
// caps and joins, which is the difference the set exists to remove: round caps
// softened the corners against a design that has no radius anywhere, and at
// 16px beside a `butt`-capped ＋ two rows up it read as two icon families.
const THEME_GLYPH_SIZE = 16

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
      <Glyph name={theme === "dark" ? "moon" : "sun"} size={THEME_GLYPH_SIZE} />
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

/**
 * WHICH CATALOGUE THE GRID RUNS ON, as a section of the rail.
 *
 * It belonged to no section until 2026-09-04 and floated over the whole skills
 * column, on the grounds that the marketplace is a statement about everything
 * there rather than about any one part of it. The owner overturned the
 * placement and not the reasoning: a statement about the whole of the app is
 * exactly what this rail already carries — where you are, who you are, what it
 * is painted in — so this is where it belongs, and it belongs above the account
 * for the same reason the account sits under the nav words it qualifies.
 *
 * EDITOR-35's collision is now the thing being built rather than the thing
 * being avoided. That row was a `fixed` version landing in the viewport's
 * bottom-left corner, on top of this rail's Github link, with a constant `left`
 * unable to fix it because the page grid centres past its max width. None of
 * that is reachable from here: a row laid out by the rail's own column takes
 * the width of its track and comes after the nav words and before the account
 * by being written between them, so the only way it can reach either is by
 * outgrowing its own box. `e2e/specs/marketplace.spec.ts` measures exactly
 * that — the vertical air to the account row and to the Github link, and the
 * horizontal spill out of the track — at the layout's floor as well as at the
 * width where the grid centres.
 *
 * Words only. The outlined button this
 * replaced is the design language of the grid and the dialogs; a bordered
 * control in here reads as a thing dropped on the rail, which is what it was.
 */
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
        {/* The catalogue that is loaded, drawn only when one is — the empty
            marketplace IS the public catalogue, and there is no name for it to
            be called by. It is the second line rather than a suffix because a
            ref does not fit beside the word in a 9.5rem column, and it is the
            one value in this section rather than a second label, which is what
            the ink says. */}
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
 * The other marketplaces this browser saved, one press away.
 *
 * Under the control that names where you are rather than inside the dialog,
 * because it answers the same question that control does and answering it
 * should not cost a dialog. It lists what the visitor SAVED and never what a
 * link brought (EDITOR-37) — so a marketplace appearing here that nobody typed
 * would be a bug on screen rather than one in storage.
 *
 * Absent below two, and that is not a special case: with one saved marketplace
 * the line above already names it and there is nowhere to switch to.
 *
 * The ref is the visible text and the verb is the accessible name, the same
 * split `SignedIn` makes: what you can see is which marketplace, and what
 * pressing it does is switch to that one. The name contains the visible text,
 * so the two are one label rather than two.
 */
function MarketplaceSwitcher() {
  const saved = useMarketplaceStore((state) => state.saved)
  const current = useMarketplaceStore((state) => state.current)
  const requestMarketplace = useUiStore((state) => state.requestMarketplace)

  // The owner's condition, and it is about what is SAVED rather than about
  // what is on screen: a switcher shown when more than one exists.
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
          // Asking, never switching: the confirmation names what the switch
          // costs, and the CTA in it is the only thing that performs one.
          onClick={() => requestMarketplace(marketplace)}
          className={`${SECTION_TEXT_CLASS} ${RAIL_CONTROL_CLASS} ${TRUNCATED_TEXT_CLASS} text-muted-foreground hover:text-ink`}
        >
          {marketplace}
        </button>
      ))}
    </div>
  )
}

// The account, under the marketplace section and the nav words it qualifies,
// rather than pinned to the foot of the rail. Words only: no border, no fill,
// no caret and no menu. A bordered pill borrows the
// filter chips' border, which means "filter" everywhere else in the app; a
// recessed field is still a container, which was the objection; and a dropdown
// contradicts a trigger that says "sign out" the moment you point at it. All
// three were built and removed.
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

  // The SECTION stays whatever the session turns out to be — it holds the
  // account's place and its spacing under the marketplace, which is true before
  // the answer arrives as well as after. Only the row inside it waits. It wore
  // a rule of its own until that was removed; nothing separates the two lower
  // sections now, and the spacing is the whole of what sets them apart.
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

// The one thing a refused attempt leaves behind. Right-aligned like everything
// else in the rail, and `alert` rather than `status` because it interrupts
// something the person just asked for.
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
        className={`${SECTION_TEXT_CLASS} text-muted-foreground group-hover:text-ink`}
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
        className={`${SECTION_TEXT_CLASS} min-w-0 truncate text-muted-foreground ${SWAP_OUT}`}
      >
        {name}
      </span>
      {/* Amber, because it is the one thing on this row that is not the state
          you are in — it is the state you are asking for. */}
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

// Words only — no icons and no cells. The active item's treatment is
// `NAV_ITEM_ACTIVE_FIELD` above and is described once, there. Sticky and full
// height so its right border reads as one continuous line down the page.
//
// SIX CHILDREN, IN THIS ORDER: logo, nav words, the marketplace section, the
// account section, the spacer, the footer row. The account used to sit under
// the spacer, which put it on the same footing as an outbound link to GitHub;
// it belongs with the navigation it qualifies, and the footer belongs to the
// two glyphs that are not navigation at all — the theme, then the mark.
//
// The marketplace is above the account rather than below it because the two
// sections say different kinds of thing, and the order runs from the app
// outwards: what you are looking at, then who is looking at it.
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
