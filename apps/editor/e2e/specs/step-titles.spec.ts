import { expect, test } from "../fixtures"
import type { ConfigurePage } from "../pages/configure-page"

// The 04 words are the no-stack form; `stacks.spec.ts` owns the stack form.
const STEPS = [
  { index: "01", words: "choose your provider" },
  { index: "02", words: "then your stack" },
  { index: "03", words: "then your sub-agents" },
  { index: "04", words: "then pick your skills" },
] as const

const SKILLS_WORDS = STEPS[3].words

// In rem, so the assertion holds whatever the root's sizing knob is set to.
const inRootUnits = async (configure: ConfigurePage, px: number) =>
  px /
  (await configure.page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).fontSize)
  ))

const marginsOf = (configure: ConfigurePage, words: string) =>
  configure.stepHinge(words).evaluate((node) => ({
    top: parseFloat(getComputedStyle(node).marginTop),
    bottom: parseFloat(getComputedStyle(node).marginBottom),
  }))

test.describe("the step titles", () => {
  for (const { index, words } of STEPS) {
    test(`${index} is a disclosure named "${words}"`, async ({ configure }) => {
      const title = configure.stepTitle(words)

      await expect(title).toHaveAttribute("aria-expanded", "true")
      await expect(title).toContainText(index)
    })
  }

  test("draw no rule", async ({ configure }) => {
    const ruled = await configure.page.evaluate(() =>
      [...document.querySelectorAll('[data-slot="hinge"] *')]
        .filter((node) => getComputedStyle(node).borderTopWidth !== "0px")
        .map((node) => node.outerHTML.slice(0, 80))
    )

    expect(ruled).toStrictEqual([])
  })

  for (const { words } of STEPS) {
    test(`"${words}" takes a gutter above and 20px below`, async ({
      configure,
    }) => {
      const margins = await marginsOf(configure, words)

      expect(await inRootUnits(configure, margins.top)).toBeCloseTo(3.75, 2)
      expect(await inRootUnits(configure, margins.bottom)).toBeCloseTo(1.25, 2)
    })
  }

  test("the search field sits one title margin under the skills title", async ({
    configure,
  }) => {
    const title = await configure.stepHinge(SKILLS_WORDS).boundingBox()
    const field = await configure.searchField.boundingBox()
    if (!title || !field) throw new Error("the title and the field must draw")
    const { bottom } = await marginsOf(configure, SKILLS_WORDS)

    expect(field.y - (title.y + title.height)).toBeCloseTo(bottom, 0)
  })

  test("paint the words, the noun and the index in their tokens", async ({
    configure,
  }) => {
    const title = configure.stepTitle(STEPS[1].words)
    const colourOf = (slot: string) =>
      title
        .locator(`[data-slot="${slot}"]`)
        .evaluate((node) => getComputedStyle(node).color)

    expect(await colourOf("hinge-words")).toBe(
      await configure.tokenColor("--color-title-ink")
    )
    expect(await colourOf("hinge-emphasis")).toBe(
      await configure.tokenColor("--color-ink-primary")
    )
    expect(await colourOf("hinge-index")).toBe(
      await configure.tokenColor("--color-brand")
    )
  })
})
