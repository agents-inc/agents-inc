import type { Page } from "@playwright/test"

import { expect, test } from "../fixtures"

// The five design colours that had no name.
//
// The hexes are quoted from the design file rather than imported from the
// stylesheet, for the reason `e2e/pages` mirrors the product's copy: an
// assertion that reads the very declaration it is checking cannot fail.
//
// `--color-tree-border` NO LONGER HOLDS ITS OWN HEX. The 2026-08-29 palette
// merge collapsed `#ece9e0` into `#eeece4` at ΔE 2.18 — imperceptible — so the
// preview dialog's pane split and the roster band now paint the same colour.
// That was a distinction somebody drew on purpose (its old comment said "one
// hex digit from --color-roster-band, and a different surface"), and it is
// gone. Recorded here rather than quietly restated, because the next reader
// should know the token survived and its separate value did not.
const NEW_TOKENS = {
  "--color-track": "#eeece4",
  "--color-track-hover": "#e7e4d9",
  "--color-track-ink": "#3d3b33",
  "--color-field-faint": "#a19d90",
  "--color-tree-border": "#eeece4",
} as const

// The two the effort meter took with it. A cycling word needs no square, so
// an empty square's outline and its fill on a switched-off agent have no
// consumer left — and this project is pre-1.0, so they go rather than linger.
const RETIRED_TOKENS = ["--color-meter-border", "--color-meter-off"] as const

// An existing token with no utility consumer and no `var()` reference
// anywhere. It is the channel: if THIS resolves, the stylesheet publishes
// unused theme variables, and the assertions above and below are about the
// tokens rather than about how Tailwind treats a variable nobody reads.
const UNCONSUMED_TOKEN = {
  name: "--color-logo-slot",
  // Was `#f4f2ec` until the palette merge folded it into `--warm-05`.
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

test.describe("design tokens", () => {
  // THE CLAIM THE TWO-TIER PALETTE EXISTS FOR, and it was false until
  // 2026-08-29. `@theme inline` substitutes a token's value into every utility
  // it generates, so while the design's tokens were literal hexes there,
  // `bg-column` compiled to `background-color: #fdfdfc` and redefining the
  // token changed nothing — a dark theme would have had to be a second
  // stylesheet. Pointed at `var(--column)` instead, the utility follows the
  // variable, which is the whole mechanism dark mode will use.
  //
  // It asserts the MECHANISM and not a palette. A dark palette now exists —
  // generated, not designed (EDITOR-07) — and this stays pointed at the
  // mechanism on purpose: an override at the root rather than a `.dark` class
  // or a `[data-theme]` stamp, so it keeps holding however the theme ends up
  // being switched, and so re-cutting the ramp cannot redden it.
  test("redefining a token re-points what is painted with it", async ({
    configure,
  }) => {
    const dock = configure.composer.dock
    await expect(dock).toHaveCSS("background-color", "rgb(253, 253, 252)")

    await configure.page.addStyleTag({ content: ":root { --column: #ff0000 }" })

    await expect(dock).toHaveCSS("background-color", "rgb(255, 0, 0)")
  })

  // THE TWO-TIER INVARIANT. Every semantic name points at a core colour and
  // holds no value of its own, so the check that matters is not "is this hex
  // right" but "do these two names resolve to the same thing". Written against
  // the tier below rather than against a literal, this survives a re-cut of the
  // ramp — which a hardcoded hex does not, as the four edits above this line
  // prove.
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

  test("the effort meter's two tokens are gone rather than orphaned", async ({
    configure,
  }) => {
    for (const name of RETIRED_TOKENS) {
      expect(await tokenValue(configure.page, name), name).toBe("")
    }
  })
})
