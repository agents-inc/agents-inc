import { argosScreenshot } from "@argos-ci/playwright"

import { expect, test } from "../fixtures"
import type { ConfigurePage } from "../pages/configure-page"
import { EXCLUSIVE_CATEGORY, STACKS } from "../support/catalog"
import { stubCreateConfig } from "../support/sharing"
import { stubSkillIndex } from "../support/skill-index"

// The appearance suite. What it asserts is about the harness rather than about
// the app — see `capture` below; every claim it makes about the app is a
// picture.
//
// Every other spec in this directory drives the app through the accessibility
// tree and checks a claim about behaviour — a role appeared, a count moved, a
// slot holds the right shape. None of them can see what the screen LOOKS like,
// and that is not an oversight: a panel that loses its padding, a dialog that
// overlaps the sticky bar, a band that goes the wrong colour will pass every
// assertion in this suite, because a `getByRole` query does not have an
// opinion about pixels. Argos does. Each capture below is one state of the
// assembled app, uploaded from CI and diffed against the render somebody last
// accepted.
//
// This is the app-level counterpart to packages/ui's Chromatic baselines,
// which cover components standing alone. The two do not overlap: a component
// that is correct in isolation and wrong in composition is invisible to that
// one and visible here.
//
// THE STATES ARE DELIBERATELY CHOSEN RATHER THAN SWEPT. Scattering captures
// through the behavioural specs would double every one of their failures — a
// spec would go red for a padding change it was never about — and would tie
// what is covered visually to what happens to be tested functionally. This
// file is the list, it is meant to be read as one, and adding a screen is
// adding a `test` here.
//
// Captures are VIEWPORT-sized rather than full page. The grid runs several
// thousand pixels down a generated catalogue, so a full-page capture would be
// mostly vendored content — every regeneration of packages/matrix would light
// up as a visual change and the real design diffs would be lost in it. What is
// below the fold is more catalogue; what is worth watching is the chrome
// around it. Flip `fullPage` per capture if a specific screen disagrees.

// EVERY STATE IS CAPTURED IN BOTH THEMES, and the doubling was argued rather
// than assumed. The second pass is an EMULATION rather than a click on the
// rail's theme glyph, and that is deliberate now that the glyph exists: it
// writes `data-theme` on the root, so a capture taken through it would leave
// the attribute set for every state after it and there would be no way to tell
// a light capture from one the toggle happened to land on. Emulating the media
// query exercises the same palette through the branch every visitor gets
// without ever touching the control, and leaves the document as it found it.
//
// A DARK SUBSET WAS THE ALTERNATIVE, AND IT WAS COSTED BEFORE IT WAS DROPPED.
// A theme here is a palette substitution and nothing else — the DOM and the box
// model are identical either way — so a dark capture can only ever show what a
// COLOUR does, and a state that repaints no surface another state already
// paints buys a baseline that can change only in lockstep with its twin. Some
// of the states below really are of that kind: `configure-stacks-folded` and
// `roster-grouped-by-scope` differ from a state above them by which elements
// are present rather than by which colours are painted. Too few of them to pay,
// though — and the opt-out list would cost the one rule this file has, that
// adding a screen is adding a `test` with no second decision to forget. Re-run
// the argument if the list ever grows enough that the quota is a question.
//
// The pass is taken on the SAME page rather than in a second Playwright
// project. Two projects over one spec file would give two screenshots the same
// name — the Argos reporter names an upload by the string passed here and by
// nothing else, so the project would not disambiguate them — and would pay for
// a second navigation to reach a state the first one already built. A media
// emulation re-evaluates the query in place.
const THEMES = ["light", "dark"] as const
type Theme = (typeof THEMES)[number]

// THE LIGHT HALF KEEPS THE NAME IT HAS ALWAYS HAD. A renamed screenshot is a
// new screenshot to Argos, so suffixing both halves would discard every
// accepted light baseline as an addition; only the dark half is new. Named
// rather than inlined at the call because it is a rule about baseline custody
// and not a string.
const screenshotName = (name: string, theme: Theme) =>
  theme === "light" ? name : `${name}-dark`

// What `--warm-01` resolves to in each theme, and `body` is painted with it
// (`--background: var(--warm-01)` in @workspace/ui's globals.css). Quoted from
// the design's palette rather than read back out of the stylesheet, for the
// reason e2e/pages mirrors the product's copy: an assertion that reads the very
// declaration it is checking cannot fail.
//
// The assertion below is about the harness rather than about the app. Argos
// compares a capture to a baseline; it has no way to know a capture was
// taken in the wrong theme, so a dark pass that silently rendered light would
// be accepted once and then guard nothing forever. That is not hypothetical —
// it is exactly what this file did before the `emulateMedia` call below was
// added, and the assertion is what said so.
const PAGE_BACKGROUND = {
  light: "rgb(255, 255, 255)",
  dark: "rgb(22, 21, 19)",
} as const satisfies Record<Theme, string>

const capture = async (configure: ConfigurePage, name: string) => {
  for (const theme of THEMES) {
    await configure.page.emulateMedia({ colorScheme: theme })
    await expect(configure.page.locator("body")).toHaveCSS(
      "background-color",
      PAGE_BACKGROUND[theme]
    )
    // Tagged so the dark half can be reviewed as a group in Argos, which is how
    // a palette change is read: all of one theme at once, rather than screen by
    // screen through both.
    await argosScreenshot(configure.page, screenshotName(name, theme), {
      fullPage: false,
      tag: theme,
    })
  }

  // Back to light, so a capture added after this one is not silently taken in
  // dark. Every test below ends on its capture today; this is what keeps that
  // from being load-bearing.
  await configure.page.emulateMedia({ colorScheme: "light" })
}

// Enough of a selection that the roster, the sticky bar and both footer
// buttons have something to draw. The scratch stack starts empty, and an empty
// right-hand column is a state worth one capture rather than the basis for all
// of them.
const withSelection = async (configure: ConfigurePage) => {
  await configure.chooseStack(STACKS.nextjs)
  await configure.roster.root.waitFor()
}

test.describe("the configure screen", () => {
  test("at rest", async ({ configure }) => {
    await capture(configure, "configure-at-rest")
  })

  test("with a stack applied", async ({ configure }) => {
    await withSelection(configure)
    await capture(configure, "configure-stack-applied")
  })

  test("with the stack grid folded away", async ({ configure }) => {
    await configure.stackToggle.click()
    await capture(configure, "configure-stacks-folded")
  })

  test("filtered down to one search term", async ({ configure }) => {
    await configure.search(EXCLUSIVE_CATEGORY.first)
    await capture(configure, "configure-searching")
  })

  test("with the filter bar pinned", async ({ configure }) => {
    await withSelection(configure)
    await configure.scrollTo(1200)
    await capture(configure, "configure-bar-pinned")
  })

  test("with nothing matching the filter", async ({ configure }) => {
    await configure.search("no skill is called this")
    await configure.emptyState.waitFor()
    await capture(configure, "configure-empty-filter")
  })
})

test.describe("the roster panel", () => {
  test("grouped by scope rather than domain", async ({ configure }) => {
    await withSelection(configure)
    await configure.roster.groupControl.click()
    await configure.roster.groupOption("scope").click()
    await capture(configure, "roster-grouped-by-scope")
  })
})

test.describe("the dialogs", () => {
  // The install dialog mints a share link on the way up, so opening it is a
  // request to the worker. Stubbed rather than allowed through — the fixture
  // refuses anything unstubbed, and a capture whose content came off somebody
  // else's server is a baseline that moves when their server does.
  test("install", async ({ configure, page }) => {
    stubCreateConfig(page)
    await withSelection(configure)
    await configure.roster.installButton.click()
    await configure.installDialog.root.waitFor()
    await capture(configure, "dialog-install")
  })

  test("output preview", async ({ configure }) => {
    await withSelection(configure)
    await configure.roster.previewButton.click()
    await configure.outputPreviewDialog.root.waitFor()
    await capture(configure, "dialog-output-preview")
  })

  test("add skill", async ({ configure, page }) => {
    stubSkillIndex(page)
    await configure.addSkillButton.click()
    await configure.addSkillDialog.root.waitFor()
    await capture(configure, "dialog-add-skill")
  })

  test("marketplace", async ({ configure }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.root.waitFor()
    await capture(configure, "dialog-marketplace")
  })
})

test.describe("the composer", () => {
  test("with a sentence drafted", async ({ configure }) => {
    await configure.composer.type("a react app with tailwind and vitest")
    await capture(configure, "composer-drafted")
  })
})
