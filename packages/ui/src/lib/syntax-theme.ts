/**
 * Syntax colour for the docs site and the editor preview, ranked by lightness with one accent.
 * Imports nothing so neither consumer's toolchain leaks into the other. Expressive Code caches
 * output: clear `dist .astro node_modules/.astro` in apps/www if an edit seems to do nothing.
 */

/** `scope` and `settings` are mutable: the highlighter writes to them. */
type SyntaxThemeRule = {
  scope: string[]
  settings: { foreground: string; fontStyle?: string }
}

type SyntaxTheme = {
  name: string
  type: "light" | "dark"
  colors: { "editor.background": string; "editor.foreground": string }
  settings: SyntaxThemeRule[]
}

// Literal hex mirroring globals.css: a TextMate theme cannot read CSS custom properties.
const PALETTE = {
  ink: "#242320",
  subtle: "#6a675c",
  faint: "#8b8778",
  brandInk: "#a06a1c",
  codeSurface: "#faf9f5",
} as const

const STRUCTURE_SCOPES = [
  "keyword",
  "storage",
  "punctuation",
  "operator",
  "entity.name.tag",
] as const
const LITERAL_SCOPES = [
  "string",
  "constant.numeric",
  "constant.language",
] as const
const COMMENT_SCOPES = ["comment", "punctuation.definition.comment"] as const

const rule = (
  scopes: readonly string[],
  settings: SyntaxThemeRule["settings"]
): SyntaxThemeRule => ({ scope: [...scopes], settings: { ...settings } })

/**
 * A factory because the highlighter mutates `settings`, so it cannot be a shared constant. Rule
 * order matters: TextMate takes the last matching rule.
 */
export const inkRampSyntaxTheme = (
  name: string,
  type: "light" | "dark"
): SyntaxTheme => ({
  name,
  type,
  colors: {
    "editor.background": PALETTE.codeSurface,
    "editor.foreground": PALETTE.ink,
  },
  settings: [
    rule(STRUCTURE_SCOPES, { foreground: PALETTE.subtle }),
    rule(LITERAL_SCOPES, { foreground: PALETTE.brandInk }),
    rule(COMMENT_SCOPES, { foreground: PALETTE.faint, fontStyle: "italic" }),
  ],
})
