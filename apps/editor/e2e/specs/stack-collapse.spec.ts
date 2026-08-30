import { expect, test } from "../fixtures"
import type { ConfigurePage } from "../pages/configure-page"
import { STACKS } from "../support/catalog"

// The two hinges the grid sits between. Located by their copy, which is what
// `configure.hinge` matches on; the second one changes its tail with the
// chosen stack, so only its stable half is named here.
const STACK_HINGE = "choose your stack"
const SKILLS_HINGE = "pick your skills"

// How much air there is between the first hinge's rule and the second's, in
// pixels — negative would be an overlap and a very large number is the void
// this whole section exists to prevent. Both boxes are read live, so there is
// not a single coordinate in here: what is asserted is a RELATIONSHIP between
// two elements that are on screen now.
//
// The number a failure prints is the point. `expected true to be false` says
// nothing a reader can act on, and the defect being guarded is a doubling —
// which only a printed measurement can name.
const hingeGap = async (configure: ConfigurePage) => {
  const first = await configure.hinge(STACK_HINGE).boundingBox()
  const second = await configure.hinge(SKILLS_HINGE).boundingBox()
  if (!first || !second) throw new Error("both hinges must be drawn")

  return second.y - (first.y + first.height)
}

// The clearance one hinge declares, read off the element rather than written
// down. It is `my-gutter` — a MARGIN — and the root font size is 110%, so a
// literal 60 would be wrong here and wrong again the day that knob moves.
const declaredClearance = async (configure: ConfigurePage) =>
  configure
    .hinge(STACK_HINGE)
    .evaluate((node) => parseFloat(getComputedStyle(node).marginBottom))

// Folding the stack grid away is an arrangement decision, like a collapsed
// roster band: it changes what is on screen and nothing about what is chosen.
test.describe("collapsing the stack grid", () => {
  test("the grid is open at rest", async ({ configure }) => {
    await expect(configure.stacks).toBeVisible()
    await expect(configure.stackToggle).toHaveAttribute("aria-expanded", "true")
    await expect(configure.stackToggle).toHaveAccessibleName("Hide stacks")
  })

  // Both directions in one test, because the absence half is worthless alone:
  // the same locator has to be seen reporting the grid before its silence
  // means the grid went away.
  test("the button folds the grid away and brings it back", async ({
    configure,
  }) => {
    await configure.stackToggle.click()

    await expect(configure.stacks).toHaveCount(0)
    await expect(configure.stackToggle).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    await expect(configure.stackToggle).toHaveAccessibleName("Show stacks")

    await configure.stackToggle.click()

    await expect(configure.stacks).toBeVisible()
    await expect(configure.stackToggle).toHaveAccessibleName("Hide stacks")
  })

  // Hiding the grid is not un-choosing the stack. The second hinge still names
  // it, the roster's counts are unchanged, and Install would write exactly
  // what it would have written — so the saved configuration must be identical
  // byte for byte, not merely similar.
  test("folding the grid away changes nothing that was chosen", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    const chosen = await configure.storedConfig()
    const installLabel = await configure.roster.installButton.textContent()
    if (installLabel === null) {
      throw new Error("the install button must carry its counts")
    }

    await configure.stackToggle.click()
    await expect(configure.stacks).toHaveCount(0)

    await expect(configure.hinge(STACKS.nextjs)).toBeVisible()
    await expect(configure.roster.installButton).toHaveText(installLabel)
    expect(await configure.storedConfig()).toBe(chosen)
  })

  // The one assertion in this file that would catch the defect this control
  // is most likely to introduce, and nothing else here would: every other
  // test above passes with a 120px void between the two rules.
  //
  // `Hinge`'s clearance is a MARGIN on both ends, so with the grid gone the
  // two hinges become adjacent siblings and their margins COLLAPSE — one
  // gutter of air, not two. Switch `Hinge` to padding, or wrap either hinge in
  // anything that establishes a new formatting context, and the collapse stops
  // happening while every other assertion here stays green.
  test("the two hinges close to one gutter apart, not two", async ({
    configure,
  }) => {
    const gutter = await declaredClearance(configure)
    // The channel: with the grid in place the gap is the grid plus its
    // clearance, so the measurement is shown carrying a value before it is
    // asked to report a small one.
    expect(await hingeGap(configure)).toBeGreaterThan(gutter * 2)

    await configure.stackToggle.click()
    await expect(configure.stacks).toHaveCount(0)

    expect(await hingeGap(configure)).toBeCloseTo(gutter, 0)
  })
})
