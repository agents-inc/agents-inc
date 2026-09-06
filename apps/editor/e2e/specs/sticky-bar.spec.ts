import type { Locator } from "@playwright/test"
import type { ConfigurePage } from "../pages/configure-page"

import { expect, test } from "../fixtures"
import { DOMAINS } from "../support/catalog"

const BELOW_THE_BAR = 200
const PAST_THE_BAR = 1500

// `#242320` — the page's one dark surface, shared with the add-skill block.
const DARK_BAND = "rgb(36, 35, 32)"

// `#55524a` — the hairline the add-skill block trades its fill for once the
// bar pins, drawn as an inset shadow so the block's box never changes size.
//
// Matched as a MEMBER of the computed list rather than as the whole of it:
// the package's focus-ring plumbing contributes four empty shadows ahead of
// whatever a utility declares, and pinning those four would be asserting the
// ring's internals from a spec about the add-skill block.
const BAND_EDGE_INSET = /rgb\(85, 82, 74\) 0px 0px 0px 1px inset/

// Chromium's spelling of no background at all.
const NO_FILL = "rgba(0, 0, 0, 0)"

// `#242320` and `#6a675c` — what the visitor typed, and the prompt they typed
// over. Two different things, and the resting field must not render them the
// same: a query set in the same grey as its own placeholder reads as
// unconfirmed.
const TYPED_TEXT = "rgb(36, 35, 32)"
const PLACEHOLDER_TEXT = "rgb(106, 103, 92)"

// The placeholder's colour cannot be reached through `toHaveCSS` — it lives on
// a pseudo-element — so it is read the same way `opacityOf` reads the roster's
// reveal: one direct computed-style lookup, no parsing.
const placeholderColorOf = (locator: Locator) =>
  locator.evaluate((node) => getComputedStyle(node, "::placeholder").color)

// The add-skill block's box, and how much band runs on past its right edge.
//
// Both read live and compared against their own RESTING values rather than
// against a coordinate: the block ends on the content edge in both states, so
// the air beside it is the page's 60px gutter without this spec ever naming the
// number or converting a rem by hand.
const blockGeometry = async (configure: ConfigurePage) => {
  const block = await configure.addSkillButton.boundingBox()
  const band = await configure.filterBand.boundingBox()
  if (!block || !band) throw new Error("the block and the band must be drawn")

  return {
    width: block.width,
    clearance: band.x + band.width - (block.x + block.width),
  }
}

// The bar changes shape at the moment CSS pins it. That state is published as
// a root attribute rather than as React state, so these read the attribute —
// which is also what the styling reads.
test.describe("sticky filter bar", () => {
  test("is not stuck at rest", async ({ configure }) => {
    await expect.poll(() => configure.isBarStuck()).toBe(false)
  })

  test("is not stuck while it is still mid-column", async ({ configure }) => {
    await configure.scrollTo(BELOW_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(false)
  })

  test("sticks once it reaches the top", async ({ configure }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)
  })

  test("releases on the way back up", async ({ configure }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await configure.scrollTo(0)
    await expect.poll(() => configure.isBarStuck()).toBe(false)
  })

  test("stays usable while stuck", async ({ configure }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await expect(configure.searchInput).toBeVisible()
    await expect(configure.addSkillButton).toBeVisible()
  })

  // Only the colour bleeds: the bar becomes a full-bleed dark band while the
  // container keeps its gutters, so the dark/white edge is what separates the
  // bar from the domain header pinning beneath it.
  test("becomes a dark band once stuck", async ({ configure }) => {
    await expect(configure.filterBand).not.toHaveCSS(
      "background-color",
      DARK_BAND
    )

    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await expect(configure.filterBand).toHaveCSS("background-color", DARK_BAND)
  })

  // ONLY THE BAND GOES DARK. The domain strip below it stays on the column
  // colour — the dark/light edge is what separates the two rows, and there is
  // no divider under the search field to do it instead. Asserted against the
  // band in the same test, because "is not dark" is satisfied by an element
  // that is not drawn at all.
  test("leaves the domain strip on the column colour", async ({
    configure,
  }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await expect(configure.filterBand).toHaveCSS("background-color", DARK_BAND)
    await expect(configure.domainTabs).not.toHaveCSS(
      "background-color",
      DARK_BAND
    )
  })

  // The claim this replaces was that the selection filters, riding at the far
  // end of the strip, kept their resting treatment while the band above them
  // went dark. There are no filters on the strip any more — `selected` is on
  // the skills hinge, which never sticks at all — so the claim has nothing left
  // to be true of. It is deleted rather than rewritten: the treatment it was
  // guarding cannot regress from a row it is not on.

  // Sticking is a scroll position, not an instruction. The bar used to put the
  // caret in its own search field the moment it pinned — on the theory that
  // reaching the top is the moment searching becomes obvious — and that grab
  // is gone (owner ruling 2026-08-09). It moves focus never.
  test("takes no focus as it sticks", async ({ configure }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await expect(configure.searchInput).not.toBeFocused()
  })

  // …and not on the way past either: scrolling on while pinned leaves the
  // caret wherever the user put it.
  test("leaves the caret alone while the page scrolls on", async ({
    configure,
  }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await configure.addSkillButton.focus()
    await configure.scrollTo(PAST_THE_BAR + 200)

    await expect(configure.addSkillButton).toBeFocused()
  })

  // The reverse direction, and the one the grab was never designed for: focus
  // can cause the scroll. Tabbing to a control the viewport is not showing
  // scrolls it into view, and that scroll can cross the pin — so a bar that
  // stuck is a keyboard user on their way *down* the page, not somebody
  // arriving at the top. Taking the caret here threw them back to it, and it
  // happened on the Tab that revealed anything below the fold.
  test("a Tab that sticks the bar keeps its focus", async ({ configure }) => {
    await configure.addSkillButton.focus()

    await configure.tabUntilBarSticks()

    await expect.poll(() => configure.isBarStuck()).toBe(true)
    await expect(configure.focusedSkillCell).toHaveCount(1)
  })

  // Design 84a on this control: the filled block becomes an outlined one the
  // moment the bar pins, so it reads as a control ON the dark band rather than
  // a second dark block sitting in it. The rule shipped with no test at all —
  // the suite asserted only that the button was still VISIBLE while stuck,
  // which is true of every possible treatment.
  test("add-skill trades its fill for a hairline once stuck", async ({
    configure,
  }) => {
    // The resting state first, over both channels: it establishes that they
    // carry a value at all, and it pins that the resting fill is the same ink
    // as the band the block is about to sit on.
    await expect(configure.addSkillButton).toHaveCSS(
      "background-color",
      DARK_BAND
    )
    await expect(configure.addSkillButton).not.toHaveCSS(
      "box-shadow",
      BAND_EDGE_INSET
    )

    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await expect(configure.addSkillButton).toHaveCSS(
      "background-color",
      NO_FILL
    )
    await expect(configure.addSkillButton).toHaveCSS(
      "box-shadow",
      BAND_EDGE_INSET
    )
  })

  // THE BLOCK IS A CONTROL ON THE BAND, NOT THE BAND'S RIGHT-HAND END. It used
  // to take the bar's right gutter as its own padding once pinned, which walked
  // its box out to the bleed edge — so the hairline the test above pins was
  // drawn around a strip with the label adrift inside it, which is a filled
  // band's shape rather than a button's. The gutter is space BESIDE the block;
  // the block hugs its label in both states.
  test("keeps its width once the bar sticks", async ({ configure }) => {
    const atRest = await blockGeometry(configure)

    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await expect
      .poll(async () => (await blockGeometry(configure)).width)
      .toBeCloseTo(atRest.width, 1)
  })

  // The other half, and the one that says where the gutter went. The resting
  // clearance is asserted first because it is the channel: a run where the band
  // and the block share a right edge in BOTH states would satisfy a stuck-only
  // assertion for the wrong reason.
  test("keeps the band running on past it once stuck", async ({
    configure,
  }) => {
    const atRest = await blockGeometry(configure)
    expect(atRest.clearance).toBeGreaterThan(0)

    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await expect
      .poll(async () => (await blockGeometry(configure)).clearance)
      .toBeCloseTo(atRest.clearance, 1)
  })

  // A typed query is a decision the visitor made and the prompt is not, so the
  // resting field has to draw them apart. Both halves asserted, because a
  // field that renders BOTH in ink is as wrong as one that renders both grey —
  // and the value-only assertion cannot tell the two apart.
  test("a typed query is set in ink, not in the placeholder's grey", async ({
    configure,
  }) => {
    expect(await placeholderColorOf(configure.searchInput)).toBe(
      PLACEHOLDER_TEXT
    )

    await configure.search("react")

    await expect(configure.searchInput).toHaveCSS("color", TYPED_TEXT)
    expect(await placeholderColorOf(configure.searchInput)).toBe(
      PLACEHOLDER_TEXT
    )
  })
})

// THE DOMAIN TITLE IS A TAB NOW, and the in-column header that used to pin
// under this bar is gone with it — a title that is always on screen cannot also
// be a thing that arrives. What replaced it is asserted in `domain-tabs.spec.ts`;
// what is asserted here is the absence, because a header left behind would sit
// under the strip repeating a name the strip already carries.
test.describe("the domain sections", () => {
  test("carry no heading of their own", async ({ configure }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    // The channel: the section is really there, so the count below is a claim
    // about its contents rather than about a locator that matched nothing.
    await expect(configure.domain(DOMAINS.web)).toBeVisible()
    await expect(
      configure.domain(DOMAINS.web).getByRole("heading", { name: DOMAINS.web })
    ).toHaveCount(0)
  })
})
