/**
 * SYNTAX COLOUR, from the palette that exists rather than from a theme that
 * ships with the tool.
 *
 * Two surfaces colour code from this one definition: the documentation site's
 * Expressive Code blocks and the editor's output preview, which renders it
 * through Shiki. It lived in apps/www/astro.config.ts while that site was its
 * only consumer, and moved here when it stopped being one — a second copy of a
 * palette is a second syntax identity, and it drifts from the first.
 *
 * A toolchain's stock light theme ranks code by HUE: Night Owl Light, which
 * Starlight ships, paints keywords `#3b61b0`, a blue that appears nowhere in
 * this design system. This one has a warm ink ramp and exactly one accent, so
 * this theme ranks by LIGHTNESS and spends the accent once — "the design ranks
 * text with tiny contrast steps" is globals.css's own description of the ramp.
 * Four rules, and they are the whole theme:
 *
 *   · everything, by default → `ink`, the same weight as body text
 *   · keywords and punctuation → `subtle`, because they are structure
 *   · string and numeric literals → `brand-ink`, because a literal is the part
 *     of an example a reader substitutes, and amber marks a chosen value
 *   · comments → `faint`, italic
 *
 * THIS MODULE IMPORTS NOTHING, AND MUST NOT START. Its two consumers have
 * nothing in common — an astro config that runs no React, and a browser chunk
 * loaded lazily behind a dialog — so the theme's shape is declared structurally
 * below rather than borrowed from either toolchain, and each caller satisfies
 * its own type at the call site. Two thirds of that is enforced for free, since
 * neither astro nor shiki is a dependency of this package and `tsc` would
 * refuse to resolve them; React is not, because React IS a dependency here, so
 * importing it would type-check and ship. syntax-theme.test.ts asserts the
 * absence directly for that reason.
 *
 * ONE THING TO KNOW BEFORE CHANGING ANY OF THIS: Expressive Code caches its
 * rendered output, and a stale cache survives an ordinary rebuild. If an edit
 * here appears to do nothing to the docs site, `rm -rf dist .astro
 * node_modules/.astro` in apps/www before concluding it did not work.
 */

/**
 * A TextMate rule: the scopes it claims, and what they are painted.
 *
 * `scope` and `settings` are MUTABLE, which is unusual here and is the point —
 * the highlighter writes to them while it resolves scopes, so a readonly array
 * is rejected at the boundary. The factory below is what makes that safe.
 */
type SyntaxThemeRule = {
  scope: string[]
  settings: { foreground: string; fontStyle?: string }
}

/** The whole theme, declared structurally because this module imports nothing. */
type SyntaxTheme = {
  name: string
  type: "light" | "dark"
  colors: { "editor.background": string; "editor.foreground": string }
  settings: SyntaxThemeRule[]
}

/**
 * The five design tokens this theme spends, by their names in
 * packages/ui/src/styles/globals.css. They are literal hex here and nowhere
 * else, because a TextMate theme is consumed by a syntax highlighter at build
 * time and cannot read a CSS custom property. If the palette moves, these five
 * move with it — which is the whole reason the theme now lives in the same
 * package as the stylesheet it mirrors.
 */
const PALETTE = {
  ink: "#242320",
  subtle: "#6a675c",
  faint: "#8b8778",
  brandInk: "#a06a1c",
  codeSurface: "#faf9f5",
} as const

/**
 * TextMate scopes, grouped by what they MEAN rather than by what they match,
 * so the three rules below read as the sentence the design makes: structure is
 * quieter than content, a literal is the part you would change, and a comment
 * is the quietest thing on the page.
 */
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

/**
 * One rule, holding nothing the caller shares with anyone else: both the scope
 * list and the settings object are copied out of the module's own data. This is
 * the single place that copying happens, so the factory below cannot forget it
 * for one of its three rules.
 */
const rule = (
  scopes: readonly string[],
  settings: SyntaxThemeRule["settings"]
): SyntaxThemeRule => ({ scope: [...scopes], settings: { ...settings } })

/**
 * The theme, built fresh on every call. IT MUST STAY A FACTORY, for two
 * independent reasons that each rule out a shared constant on their own:
 *
 *   · the highlighter MUTATES `settings` while it resolves scopes, so the usual
 *     way of making a shared constant safe — `as const`, or a readonly array —
 *     is rejected at the boundary;
 *   · packages/cli/CLAUDE.md forbids exporting a shared constant whose value
 *     holds a mutable array, because callers receive it by identity and one
 *     `push` anywhere corrupts every holder.
 *
 * A constant satisfying either of those breaks the other; only a factory
 * answers both. `settings` is ordered rather than sorted, and the order is
 * load-bearing: TextMate resolves overlapping scopes by taking the LAST
 * matching rule, so moving these three recolours the output.
 *
 * `editor.background` is set here and the docs site never renders it —
 * `useStarlightUiThemeColors: true` hands a code block's own surface to
 * Starlight's tokens. It is set for the editor's preview, which has no
 * Starlight over it.
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
