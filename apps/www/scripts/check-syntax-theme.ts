/**
 * Holds that astro.config.ts imports the syntax theme from @workspace/ui and
 * declares none of it, and that the built docs still render the four token
 * colours (membership both ways: a count cannot see a swap). The code-block
 * surface is not checked: Starlight's chrome replaces it. Needs `astro build`;
 * Expressive Code caches output, so clear `dist .astro node_modules/.astro` if in doubt.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const ASTRO_CONFIG = fileURLToPath(
  new URL("../astro.config.ts", import.meta.url)
)
const ASTRO_CONFIG_LABEL = "astro.config.ts"

// Only /docs carries code blocks.
const DIST_DOCS = fileURLToPath(new URL("../dist/docs/", import.meta.url))
const DIST_DOCS_LABEL = "dist/docs/"

const THEME_MODULE = "@workspace/ui/lib/syntax-theme"
const THEME_FACTORY = "inkRampSyntaxTheme"

// `SYNTAX_THEMES` is not listed: the Starlight light/dark pair stays local.
const MOVED_BINDINGS = [
  THEME_FACTORY,
  "PALETTE",
  "STRUCTURE_SCOPES",
  "LITERAL_SCOPES",
  "COMMENT_SCOPES",
]

// Quoted, so only a string literal matches, not a hex cited in a comment.
const PALETTE_LITERALS = [
  '"#242320"',
  '"#6a675c"',
  '"#8b8778"',
  '"#a06a1c"',
  '"#faf9f5"',
]

// Expressive Code writes each colour, uppercased, into a custom property per span.
const RENDERED_TOKEN_COLOURS = {
  "#242320": "default text, from --color-ink",
  "#6A675C": "keywords and punctuation, from --color-subtle",
  "#A06A1C": "string and numeric literals, from --color-brand-ink",
  "#8B8778": "comments, from --color-faint",
} as const

const ITALIC_COLOUR = "#8B8778"

/** `style="--0:#6A675C;--1:#6A675C"` — the first is the light theme's slot. */
const TOKEN_COLOUR = /--0:(#[0-9A-Fa-f]{6})/g

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

/** The four measured colours, and no fifth. */
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

function italicIsOnCommentsAlone(): Drift | null {
  const italic = distinctMatches(ITALIC_TOKEN)

  return driftBetween(
    `only ${ITALIC_COLOUR} — comments, from --color-faint — may render italic`,
    [ITALIC_COLOUR].filter((hex) => !italic.includes(hex)),
    italic.filter((hex) => hex !== ITALIC_COLOUR)
  )
}

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

/** An empty read is the defect, not a pass. */
function refuse(reason: string): never {
  throw new Error(`syntax theme: ${reason}`)
}

main()
