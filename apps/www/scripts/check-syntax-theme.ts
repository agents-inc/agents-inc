/**
 * The third thing this site cannot see about itself: whether its code blocks
 * are still coloured by the design system's palette, and whether that palette
 * is still stated in exactly one place.
 *
 * WHY THIS EXISTS. `inkRampSyntaxTheme` was declared in astro.config.ts, with
 * five literal hexes mirroring five tokens in packages/ui's globals.css and a
 * comment saying so. That was the only arrangement available while this site
 * was the theme's only consumer. It stopped being the only consumer when the
 * editor's output preview needed the same colours, and a second copy of a
 * palette is a second syntax identity that drifts from the first — so the
 * definition moved to packages/ui/src/lib/syntax-theme.ts and both surfaces now
 * read it.
 *
 * That move is invisible to every other gate here. `astro check` reads types
 * and a duplicated object literal is perfectly well typed; `astro build`
 * happily builds a site whose colours have silently reverted to Night Owl
 * Light; `eslint` reads syntax. Nothing anywhere notices a palette that has
 * come back, and nothing notices a theme that has stopped being applied. The
 * built HTML is the only witness, and this reads it.
 *
 * WHAT IT CHECKS, as two claims about the product:
 *
 *   1. THE PALETTE IS STATED ONCE. astro.config.ts reads the factory from
 *      @workspace/ui and declares neither the factory nor any of its five
 *      hexes itself. Both halves matter and only together: an import that sits
 *      above a surviving local copy compiles, passes every other gate, and
 *      leaves two definitions to drift.
 *
 *   2. THE BUILT PAGES STILL RENDER THE SAME FOUR TOKEN COLOURS. Membership in
 *      both directions rather than a count, for the reason check-cli-claims.ts
 *      gives: a count cannot see a swap, and swapping the structure colour for
 *      the literal colour recolours every page while leaving the total at four.
 *
 * THE FOUR ARE MEASURED, NOT TRANSCRIBED. They were read out of a clean build
 * — `rm -rf dist .astro node_modules/.astro` first, because Expressive Code
 * caches its rendered output and a stale cache survives an ordinary rebuild —
 * taken on 2026-08-26, before the theme moved. Expressive Code uppercases the
 * hex it emits, which is why these are not byte-identical to the source.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK. The code block's own surface. The theme
 * sets `editor.background` to `--color-code` (#faf9f5) and the site never
 * renders it: `useStarlightUiThemeColors: true` hands the block's chrome to
 * Starlight's `--sl-color-*` mapping instead, which is a decision recorded in
 * astro.config.ts and not a defect. The value stays in the theme because the
 * editor's preview has no Starlight over it and does render it. That absence is
 * named here rather than encoded as a shorter expected list, so nobody reading
 * this later mistakes it for an oversight.
 *
 * Also not contrast: todo/www.md records under "Constraints already settled"
 * that WCAG AA is deliberately not met on this site (owner ruling, 2026-08-07),
 * and `minSyntaxHighlightingColorContrast: 0` exists to stop Expressive Code
 * quietly rewriting `--color-brand-ink` on the way out. A contrast assertion
 * here would fail on purpose and be switched off within the week.
 *
 * Runs against `dist/`, so it needs `astro build` first — the same dependency
 * apps/www/turbo.json already declares for check-type-scale.ts.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

/** The config that used to declare the theme, and now must only import it. */
const ASTRO_CONFIG = fileURLToPath(
  new URL("../astro.config.ts", import.meta.url)
)
const ASTRO_CONFIG_LABEL = "astro.config.ts"

/** The built pages. Only `/docs` carries code blocks; the landing page has none. */
const DIST_DOCS = fileURLToPath(new URL("../dist/docs/", import.meta.url))
const DIST_DOCS_LABEL = "dist/docs/"

/** The one place the palette is allowed to live. */
const THEME_MODULE = "@workspace/ui/lib/syntax-theme"
const THEME_FACTORY = "inkRampSyntaxTheme"

/**
 * The five bindings that made up the theme while it lived here, none of which
 * may be declared in this config again. `SYNTAX_THEMES` is deliberately not on
 * the list: the light/dark pair Starlight requires is this site's own
 * arrangement rather than a shared one, and it stays.
 */
const MOVED_BINDINGS = [
  THEME_FACTORY,
  "PALETTE",
  "STRUCTURE_SCOPES",
  "LITERAL_SCOPES",
  "COMMENT_SCOPES",
]

/**
 * The five design tokens, by their names in packages/ui/src/styles/globals.css.
 * Present here to assert their ABSENCE from astro.config.ts — this list is the
 * "declared nowhere else on this site" half of claim 1, not a copy of the
 * palette for anything to read.
 *
 * QUOTED, and that is the whole of why this works on prose. The docblock over
 * `minSyntaxHighlightingColorContrast` cites `#a06a1c` in passing, as evidence
 * for an owner ruling that has nothing to do with where the theme lives, and it
 * stays in this file after the move. A bare substring search finds it and goes
 * red forever; a search for the hex as a string LITERAL finds only a palette
 * that has come back. The distinction was not theoretical — the first run of
 * this check reported that line as a surviving declaration.
 */
const PALETTE_LITERALS = [
  '"#242320"',
  '"#6a675c"',
  '"#8b8778"',
  '"#a06a1c"',
  '"#faf9f5"',
]

/**
 * What a built page carries today, by the role each colour plays. Expressive
 * Code writes the token colour into a CSS custom property on each span, and
 * uppercases it.
 */
const RENDERED_TOKEN_COLOURS = {
  "#242320": "default text, from --color-ink",
  "#6A675C": "keywords and punctuation, from --color-subtle",
  "#A06A1C": "string and numeric literals, from --color-brand-ink",
  "#8B8778": "comments, from --color-faint",
} as const

/** The one colour the theme also asks to be italic. */
const ITALIC_COLOUR = "#8B8778"

/** `style="--0:#6A675C;--1:#6A675C"` — the first is the light theme's slot. */
const TOKEN_COLOUR = /--0:(#[0-9A-Fa-f]{6})/g

/** The same span, when the theme asked for italic as well. */
const ITALIC_TOKEN = /--0:(#[0-9A-Fa-f]{6});--0fs:italic/g

type Drift = {
  claim: string
  namedButAbsent: string[]
  presentButUnnamed: string[]
}

function main(): never {
  const drift = [
    paletteStatedOnce(),
    renderedColoursUnchanged(),
    italicIsOnCommentsAlone(),
  ].filter(isDrift)

  return exitWith(drift)
}

/** Claim 1: the config imports the factory and declares no palette of its own. */
function paletteStatedOnce(): Drift | null {
  if (!existsSync(ASTRO_CONFIG)) refuse(`${ASTRO_CONFIG_LABEL} is not there`)
  const source = readFileSync(ASTRO_CONFIG, "utf8")

  const missing = source.includes(THEME_MODULE)
    ? []
    : [`an import of ${THEME_FACTORY} from ${THEME_MODULE}`]

  const lowered = source.toLowerCase()
  const surviving = [
    ...MOVED_BINDINGS.filter((name) => source.includes(`const ${name}`)).map(
      (name) => `a local declaration of ${name}`
    ),
    ...PALETTE_LITERALS.filter((hex) => lowered.includes(hex)).map(
      (hex) => `the literal ${hex}`
    ),
  ]

  return driftBetween(
    `${ASTRO_CONFIG_LABEL} must read the theme from ${THEME_MODULE} and state none of it itself`,
    missing,
    surviving
  )
}

/** Claim 2: the four measured colours, and no fifth. */
function renderedColoursUnchanged(): Drift | null {
  const rendered = distinctMatches(TOKEN_COLOUR)
  if (rendered.length === 0) {
    refuse(`${DIST_DOCS_LABEL} has no highlighted code block in it`)
  }

  const expected = Object.keys(RENDERED_TOKEN_COLOURS)

  return driftBetween(
    "the built pages must render the four palette colours and no others",
    expected.filter((hex) => !rendered.includes(hex)),
    rendered.filter((hex) => !expected.includes(hex))
  )
}

/** Claim 2b: the comment colour is italic, and it is the only italic one. */
function italicIsOnCommentsAlone(): Drift | null {
  const italic = distinctMatches(ITALIC_TOKEN)

  return driftBetween(
    `only ${ITALIC_COLOUR} — comments, from --color-faint — may render italic`,
    [ITALIC_COLOUR].filter((hex) => !italic.includes(hex)),
    italic.filter((hex) => hex !== ITALIC_COLOUR)
  )
}

/** Every distinct capture of `pattern` across the built documentation pages. */
function distinctMatches(pattern: RegExp): string[] {
  const found = new Set<string>()
  for (const page of builtPages()) {
    for (const [, hex] of readFileSync(page, "utf8").matchAll(pattern)) {
      if (hex !== undefined) found.add(hex)
    }
  }
  return [...found].sort()
}

function builtPages(): string[] {
  if (!existsSync(DIST_DOCS)) {
    refuse(`${DIST_DOCS_LABEL} is not there — run \`astro build\` first`)
  }

  const pages = readdirSync(DIST_DOCS, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".html"))
    .map((entry) => join(DIST_DOCS, entry))

  if (pages.length === 0) refuse(`${DIST_DOCS_LABEL} holds no built page`)
  return pages
}

function driftBetween(
  claim: string,
  namedButAbsent: string[],
  presentButUnnamed: string[]
): Drift | null {
  if (namedButAbsent.length === 0 && presentButUnnamed.length === 0) return null
  return { claim, namedButAbsent, presentButUnnamed }
}

function isDrift(verdict: Drift | null): verdict is Drift {
  return verdict !== null
}

function exitWith(drift: Drift[]): never {
  if (drift.length === 0) {
    const colours = Object.keys(RENDERED_TOKEN_COLOURS).length
    console.log(
      `syntax theme: one definition, ${colours} token colours, all rendered`
    )
    process.exit(0)
  }

  console.error(`syntax theme: ${drift.length} failure(s)\n`)
  for (const { claim, namedButAbsent, presentButUnnamed } of drift) {
    console.error(`  ${claim}`)
    for (const member of namedButAbsent) {
      console.error(`    · expected, and nothing has it: ${member}`)
    }
    for (const member of presentButUnnamed) {
      console.error(`    · present, and nothing expects it: ${member}`)
    }
  }
  console.error(
    `\nThe palette lives once, in packages/ui/src/lib/syntax-theme.ts, mirroring` +
      `\nthe five tokens in packages/ui/src/styles/globals.css.`
  )
  process.exit(1)
}

/** Every way of judging nothing, said out loud. A quiet empty read is the defect, not a pass. */
function refuse(reason: string): never {
  throw new Error(`syntax theme: ${reason}`)
}

main()
