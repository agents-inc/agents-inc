/**
 * The ink-ramp syntax theme, which two surfaces now colour code from: the
 * documentation site's Expressive Code blocks and the editor's output preview.
 *
 * WHY THESE ASSERTIONS AND NOT OTHERS. The theme is a plain data object, so
 * almost every property of it is pinned by one `toStrictEqual`. What that
 * equality cannot see is the two things this module exists to get right, and
 * they are the two `describe` blocks below:
 *
 *   1. IT IS A FACTORY, NOT A CONSTANT. Two independent reasons, both binding
 *      and each sufficient on its own. The highlighter MUTATES `settings` while
 *      it resolves scopes — apps/www/astro.config.ts records this as the reason
 *      `as const` cannot be used there — so a frozen or readonly value is
 *      rejected at the boundary. And packages/cli/CLAUDE.md forbids exporting a
 *      shared constant whose value holds a mutable array, because callers
 *      receive it by identity and one `push` anywhere corrupts every holder.
 *      A constant satisfying one reason breaks the other; only a factory
 *      answers both. Structural equality cannot tell the two apart, so identity
 *      is asserted directly.
 *
 *   2. THE COLOURS ARE THE DESIGN PALETTE. Five hexes, mirrored below as
 *      literals rather than imported from the module under test. An assertion
 *      that imports the very constant the subject renders cannot fail, because
 *      both sides move together — the same reason apps/editor/e2e/pages/constants.ts
 *      mirrors the product's strings instead of importing them.
 *
 * THE VALUES ARE MEASURED, NOT COPIED FROM THE SOURCE. They were read back out
 * of a clean `bun run build` of apps/www (`rm -rf dist .astro node_modules/.astro`
 * first, because Expressive Code caches its rendered output and a stale cache
 * survives an ordinary rebuild). The built HTML carries four distinct syntax
 * colours, and they are these four with the casing Expressive Code emits:
 *
 *     --0:#242320                          default text  → ink
 *     --0:#6A675C                          structure     → subtle
 *     --0:#A06A1C                          literals      → brand-ink
 *     --0:#8B8778;--0fs:italic             comments      → faint, italic
 *
 * so this file's job is to keep the factory producing exactly what the site
 * rendered before the theme moved out of its astro config. The rendered half of
 * that claim — that those four still reach the built HTML — is asserted against
 * `dist/` by apps/www/scripts/check-syntax-theme.ts, which is also where the
 * fifth value's absence is recorded: `editor.background` is set here but never
 * reaches the site, because `useStarlightUiThemeColors: true` hands the block's
 * own surface to Starlight's tokens instead. It is set for the editor, which
 * has no Starlight over it.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { inkRampSyntaxTheme } from "@workspace/ui/lib/syntax-theme"

/**
 * The five design tokens the theme spends, by their names in
 * packages/ui/src/styles/globals.css. Mirrored as literals on purpose — see the
 * file docblock. A TextMate theme is consumed by a syntax highlighter at build
 * time and cannot read a CSS custom property, so these are the one place in the
 * repository where the palette is duplicated, and this is the assertion that
 * makes the duplication safe.
 */
const INK = "#242320"
const SUBTLE = "#6a675c"
const FAINT = "#8b8778"
const BRAND_INK = "#a06a1c"
const CODE_SURFACE = "#faf9f5"

/** The two names apps/www asks for, and the pair it builds from them. */
const LIGHT_NAME = "agents-inc"
const DARK_NAME = "agents-inc-dark"

/**
 * The three scope rosters, asserted as membership rather than as a count: a
 * count cannot see a swap, and swapping one scope between the structure list
 * and the literal list is precisely the change that would recolour the site
 * while leaving all three lengths identical.
 */
const EXPECTED_STRUCTURE_SCOPES = [
  "keyword",
  "storage",
  "punctuation",
  "operator",
  "entity.name.tag",
]
const EXPECTED_LITERAL_SCOPES = [
  "string",
  "constant.numeric",
  "constant.language",
]
const EXPECTED_COMMENT_SCOPES = ["comment", "punctuation.definition.comment"]

/**
 * A function rather than a constant, for the same reason the subject is one:
 * this value holds three mutable arrays, and a single expected object shared by
 * every assertion in the file would be one `push` away from making the others
 * lie. `validResult()` in packages/cli/src/cli/lib/validation-result.ts is the
 * precedent.
 *
 * The `settings` ORDER is load-bearing and is pinned here rather than sorted:
 * TextMate resolves overlapping scopes by taking the last matching rule, so
 * reordering these three is a visible recolour.
 */
const expectedTheme = (name: string, type: "light" | "dark") => ({
  name,
  type,
  colors: {
    "editor.background": CODE_SURFACE,
    "editor.foreground": INK,
  },
  settings: [
    { scope: EXPECTED_STRUCTURE_SCOPES, settings: { foreground: SUBTLE } },
    { scope: EXPECTED_LITERAL_SCOPES, settings: { foreground: BRAND_INK } },
    {
      scope: EXPECTED_COMMENT_SCOPES,
      settings: { foreground: FAINT, fontStyle: "italic" },
    },
  ],
})

describe("inkRampSyntaxTheme", () => {
  describe("is a factory rather than a shared constant", () => {
    it("returns a new object on every call", () => {
      expect(inkRampSyntaxTheme(LIGHT_NAME, "light")).not.toBe(
        inkRampSyntaxTheme(LIGHT_NAME, "light")
      )
    })

    it("returns a new settings array on every call", () => {
      expect(inkRampSyntaxTheme(LIGHT_NAME, "light").settings).not.toBe(
        inkRampSyntaxTheme(LIGHT_NAME, "light").settings
      )
    })

    it("returns a new colors object on every call", () => {
      expect(inkRampSyntaxTheme(LIGHT_NAME, "light").colors).not.toBe(
        inkRampSyntaxTheme(LIGHT_NAME, "light").colors
      )
    })

    it("returns a new scope list on every call", () => {
      expect(
        inkRampSyntaxTheme(LIGHT_NAME, "light").settings[0]?.scope
      ).not.toBe(inkRampSyntaxTheme(LIGHT_NAME, "light").settings[0]?.scope)
    })

    it("returns two calls that are structurally identical", () => {
      expect(inkRampSyntaxTheme(LIGHT_NAME, "light")).toStrictEqual(
        inkRampSyntaxTheme(LIGHT_NAME, "light")
      )
    })

    it("does not carry a caller's appended rule into the next call", () => {
      const mutated = inkRampSyntaxTheme(LIGHT_NAME, "light")
      mutated.settings.push({
        scope: ["variable"],
        settings: { foreground: BRAND_INK },
      })

      expect(inkRampSyntaxTheme(LIGHT_NAME, "light")).toStrictEqual(
        expectedTheme(LIGHT_NAME, "light")
      )
    })

    it("does not carry a caller's appended scope into the next call", () => {
      const mutated = inkRampSyntaxTheme(LIGHT_NAME, "light")
      mutated.settings[0]?.scope.push("variable")

      expect(inkRampSyntaxTheme(LIGHT_NAME, "light")).toStrictEqual(
        expectedTheme(LIGHT_NAME, "light")
      )
    })

    it("does not carry a caller's recoloured token into the next call", () => {
      const mutated = inkRampSyntaxTheme(LIGHT_NAME, "light")
      mutated.colors["editor.foreground"] = BRAND_INK

      expect(
        inkRampSyntaxTheme(LIGHT_NAME, "light").colors["editor.foreground"]
      ).toBe(INK)
    })
  })

  describe("spends the design palette and nothing else", () => {
    it("is exactly the light theme apps/www rendered before the move", () => {
      expect(inkRampSyntaxTheme(LIGHT_NAME, "light")).toStrictEqual(
        expectedTheme(LIGHT_NAME, "light")
      )
    })

    it("is exactly the dark theme apps/www rendered before the move", () => {
      expect(inkRampSyntaxTheme(DARK_NAME, "dark")).toStrictEqual(
        expectedTheme(DARK_NAME, "dark")
      )
    })

    it("paints default code in the ink token", () => {
      expect(
        inkRampSyntaxTheme(LIGHT_NAME, "light").colors["editor.foreground"]
      ).toBe(INK)
    })

    it("paints the code surface in the code token", () => {
      expect(
        inkRampSyntaxTheme(LIGHT_NAME, "light").colors["editor.background"]
      ).toBe(CODE_SURFACE)
    })

    it("paints structure in the subtle token", () => {
      expect(inkRampSyntaxTheme(LIGHT_NAME, "light").settings[0]).toStrictEqual(
        {
          scope: EXPECTED_STRUCTURE_SCOPES,
          settings: { foreground: SUBTLE },
        }
      )
    })

    it("paints literals in the brand-ink token", () => {
      expect(inkRampSyntaxTheme(LIGHT_NAME, "light").settings[1]).toStrictEqual(
        {
          scope: EXPECTED_LITERAL_SCOPES,
          settings: { foreground: BRAND_INK },
        }
      )
    })

    it("paints comments in the faint token, italic", () => {
      expect(inkRampSyntaxTheme(LIGHT_NAME, "light").settings[2]).toStrictEqual(
        {
          scope: EXPECTED_COMMENT_SCOPES,
          settings: { foreground: FAINT, fontStyle: "italic" },
        }
      )
    })
  })

  describe("takes its identity from its arguments", () => {
    it("names the theme what the caller asked for", () => {
      expect(inkRampSyntaxTheme(DARK_NAME, "dark").name).toBe(DARK_NAME)
    })

    it("declares the type the caller asked for", () => {
      expect(inkRampSyntaxTheme(DARK_NAME, "dark").type).toBe("dark")
    })

    it("colours a dark theme the same as a light one", () => {
      const dark = inkRampSyntaxTheme(DARK_NAME, "dark")
      const light = inkRampSyntaxTheme(LIGHT_NAME, "light")

      expect(dark.colors).toStrictEqual(light.colors)
      expect(dark.settings).toStrictEqual(light.settings)
    })
  })

  describe("stays consumable by every surface that wants it", () => {
    /**
     * The module imports nothing — not React, not astro, not shiki. Two of
     * those three are already caught for free, because neither astro nor shiki
     * is a dependency of packages/ui and this workspace's own `tsc --noEmit`
     * would refuse to resolve them. React is not: it IS a dependency here, so a
     * React import would type-check, ship, and only surface as a broken import
     * inside apps/www's astro config, which runs no React at all. This
     * assertion is the only thing standing between that and a green build.
     *
     * The regex is anchored per line so the word "import" inside the module's
     * own prose does not satisfy it.
     */
    it("declares no imports of its own", () => {
      const source = readFileSync(
        fileURLToPath(new URL("./syntax-theme.ts", import.meta.url)),
        "utf8"
      )

      expect(source).not.toMatch(/^\s*import\s/m)
    })
  })
})
