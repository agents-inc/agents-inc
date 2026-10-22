// The palette is mirrored as literals, not imported: an assertion importing the subject's own
// constant cannot fail. apps/www/scripts/check-syntax-theme.ts checks the rendered half.
import { describe, expect, it } from "vitest"

import { inkRampSyntaxTheme } from "@workspace/ui/lib/syntax-theme"

const INK = "#242320"
const SUBTLE = "#6a675c"
const FAINT = "#8b8778"
const BRAND_INK = "#a06a1c"
const CODE_SURFACE = "#faf9f5"

const LIGHT_NAME = "agents-inc"
const DARK_NAME = "agents-inc-dark"

// Membership, not counts: a count cannot see a scope swapped between lists.
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

// A function so no shared expected value can be mutated between tests.
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
})
