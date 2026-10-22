import type { Page } from "@playwright/test"

import { expect, test } from "../fixtures"
import { PAGE_BACKGROUND } from "../pages/configure-page"

// Quoted from the design file rather than imported, so the assertion can fail.
const NEW_TOKENS = {
  "--color-track": "#eeece4",
  "--color-track-hover": "#e7e4d9",
  "--color-track-ink": "#3d3b33",
  "--color-field-faint": "#a19d90",
  "--color-tree-border": "#eeece4",
  // v6's step-title ink and the Codex error pair.
  "--color-title-ink": "#5f5c52",
  "--color-error-ink": "#b5442c",
  "--color-error-wash": "#f8e8e2",
} as const

// Tokens whose drawing was retired, gone rather than left resolving.
const RETIRED_TOKENS = [
  "--color-meter-border",
  "--color-meter-off",
  "--color-tab-label",
  "--color-tab-count",
  "--color-tab-field",
  "--color-tab-index",
] as const

// v6's semantics, pinned by the core each points at.
const V6_SEMANTICS = [
  ["--color-title-ink", "--warm-23"],
  ["--color-title-hover", "--warm-06"],
  ["--color-strip-stuck", "--warm-06"],
  ["--color-recede-wash", "--warm-06"],
  ["--color-recede-ink", "--warm-13"],
  // #f6f4ed, the tip surface.
  ["--color-tip-field", "--warm-06"],
  ["--color-unavailable", "--warm-11"],
  ["--color-error-wash", "--rust-01"],
  ["--color-error-ink", "--rust-02"],
] as const

// The control: a token nothing consumes still resolves, so the assertions here
// are about the tokens rather than Tailwind pruning an unread variable.
const UNCONSUMED_TOKEN = {
  name: "--color-logo-slot",
  value: "#faf9f5",
} as const

const tokenValue = (page: Page, name: string) =>
  page.evaluate(
    (property) =>
      getComputedStyle(document.documentElement)
        .getPropertyValue(property)
        .trim(),
    name
  )

// The WCAG contrast ratio of the error ink on the error wash.
const errorPairContrast = (page: Page) =>
  page.evaluate(() => {
    const luminance = (token: string) => {
      const probe = document.createElement("span")
      probe.style.color = `var(${token})`
      document.body.append(probe)
      const channels = getComputedStyle(probe).color.match(/\d+/g) ?? []
      probe.remove()
      const [r = 0, g = 0, b = 0] = channels.map((channel) => {
        const c = Number(channel) / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const [lighter, darker] = [
      luminance("--color-error-ink"),
      luminance("--color-error-wash"),
    ].sort((a, b) => b - a)
    return (lighter! + 0.05) / (darker! + 0.05)
  })

test.describe("design tokens", () => {
  // The mechanism, not a palette: `@theme inline` points each utility at the
  // variable, so a root override re-points what is painted.
  test("redefining a token re-points what is painted with it", async ({
    configure,
  }) => {
    const dock = configure.composer.dock
    // #faf8f2, the main column, which the dock carries as its own ground.
    await expect(dock).toHaveCSS("background-color", "rgb(250, 248, 242)")

    await configure.page.addStyleTag({ content: ":root { --column: #ff0000 }" })

    await expect(dock).toHaveCSS("background-color", "rgb(255, 0, 0)")
  })

  // Against the core tier rather than a literal, so a re-cut of the ramp
  // cannot redden it.
  test("a semantic token resolves to the core colour it points at", async ({
    configure,
  }) => {
    for (const [semantic, core] of [
      ["--color-page", "--warm-01"],
      ["--color-hairline", "--warm-10"],
      ["--color-brand", "--amber-08"],
    ] as const) {
      const want = await tokenValue(configure.page, core)
      expect(want, `${core} must exist`).not.toBe("")
      expect(await tokenValue(configure.page, semantic), semantic).toBe(want)
    }
  })

  for (const [semantic, core] of V6_SEMANTICS) {
    test(`${semantic} points at ${core}`, async ({ configure }) => {
      const want = await tokenValue(configure.page, core)
      expect(want, `${core} must exist`).not.toBe("")
      expect(await tokenValue(configure.page, semantic)).toBe(want)
    })
  }

  // The one new ink-on-wash pair, so its dark complement is held to the light
  // pair's legibility.
  test("the error ink is as legible on its wash in dark as in light", async ({
    configure,
  }) => {
    const light = await errorPairContrast(configure.page)

    await configure.themeToggle.click()
    await expect(configure.page.locator("body")).toHaveCSS(
      "background-color",
      PAGE_BACKGROUND.dark
    )

    expect(await errorPairContrast(configure.page)).toBeGreaterThanOrEqual(
      light
    )
  })

  test("a token nobody consumes still resolves at the root", async ({
    configure,
  }) => {
    expect(await tokenValue(configure.page, UNCONSUMED_TOKEN.name)).toBe(
      UNCONSUMED_TOKEN.value
    )
  })

  for (const [name, hex] of Object.entries(NEW_TOKENS)) {
    test(`${name} resolves to the design's own hex`, async ({ configure }) => {
      expect(await tokenValue(configure.page, name)).toBe(hex)
    })
  }

  test("a retired drawing's tokens are gone rather than orphaned", async ({
    configure,
  }) => {
    for (const name of RETIRED_TOKENS) {
      expect(await tokenValue(configure.page, name), name).toBe("")
    }
  })
})
