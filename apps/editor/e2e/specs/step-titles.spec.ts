import type { Locator } from "@playwright/test"

import { expect, test } from "../fixtures"
import type { ConfigurePage } from "../pages/configure-page"

const boxOf = async (target: Locator) => {
  const box = await target.boundingBox()
  if (!box) throw new Error("the element must be drawn")
  return box
}

const bottomOf = async (target: Locator) => {
  const box = await boxOf(target)
  return box.y + box.height
}

// The 04 words are the no-stack form; `stacks.spec.ts` owns the stack form.
// Each title sits between the edge above it (the column's top, then the step
// before) and its own step's first content.
const STEPS = [
  {
    index: "01",
    words: "choose your provider",
    edgeAbove: async (configure: ConfigurePage) =>
      (await boxOf(configure.page.getByRole("main"))).y,
    content: (configure: ConfigurePage) => configure.provider.root,
  },
  {
    index: "02",
    words: "then your stack",
    edgeAbove: (configure: ConfigurePage) => bottomOf(configure.provider.root),
    content: (configure: ConfigurePage) => configure.stacks,
  },
  {
    index: "03",
    words: "then your sub-agents",
    edgeAbove: (configure: ConfigurePage) => bottomOf(configure.stacks),
    content: (configure: ConfigurePage) => configure.subAgents.groups.first(),
  },
  {
    index: "04",
    words: "then pick your skills",
    edgeAbove: (configure: ConfigurePage) =>
      bottomOf(configure.subAgents.groups.last()),
    content: (configure: ConfigurePage) => configure.searchField,
  },
] as const

// In rem, so the assertion holds whatever the root's sizing knob is set to.
const inRootUnits = async (configure: ConfigurePage, px: number) =>
  px /
  (await configure.page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).fontSize)
  ))

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

  for (const { words, edgeAbove, content } of STEPS) {
    test(`"${words}" takes a gutter above and 20px below`, async ({
      configure,
    }) => {
      const title = await boxOf(configure.stepTitle(words))
      const below = await boxOf(content(configure))
      const above = title.y - (await edgeAbove(configure))

      expect(await inRootUnits(configure, above)).toBeCloseTo(3.75, 2)
      expect(
        await inRootUnits(configure, below.y - (title.y + title.height))
      ).toBeCloseTo(1.25, 2)
    })
  }

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
