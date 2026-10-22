/**
 * Holds that the built docs render the syntax theme @workspace/ui exports: its
 * token colours and no other (membership both ways: a count cannot see a swap),
 * and italic on its italic rules' colours alone. The code-block surface is not
 * checked: Starlight's chrome replaces it. Needs `astro build`; Expressive Code
 * caches output, so clear `dist .astro node_modules/.astro` if in doubt.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { inkRampSyntaxTheme } from "@workspace/ui/lib/syntax-theme"

// Only /docs carries code blocks.
const DIST_DOCS = fileURLToPath(new URL("../dist/docs/", import.meta.url))
const DIST_DOCS_LABEL = "dist/docs/"

const THEME_MODULE = "@workspace/ui/lib/syntax-theme"

// Name and type set no colour.
const THEME = inkRampSyntaxTheme("agents-inc", "light")

// Expressive Code writes each colour, uppercased, into a custom property per span.
const asRendered = (hex: string) => hex.toUpperCase()

const distinctSorted = (hexes: string[]) => [...new Set(hexes)].sort()

// Default text, then each rule's foreground.
const TOKEN_COLOURS = distinctSorted(
  [
    THEME.colors["editor.foreground"],
    ...THEME.settings.map((rule) => rule.settings.foreground),
  ].map(asRendered)
)

const ITALIC_COLOURS = distinctSorted(
  THEME.settings
    .filter((rule) => rule.settings.fontStyle === "italic")
    .map((rule) => asRendered(rule.settings.foreground))
)

/** `style="--0:#6A675C;--1:#6A675C"` — the first is the light theme's slot. */
const TOKEN_COLOUR = /--0:(#[0-9A-Fa-f]{6})/g

const ITALIC_TOKEN = /--0:(#[0-9A-Fa-f]{6});--0fs:italic/g

type Drift = {
  claim: string
  namedButAbsent: string[]
  presentButUnnamed: string[]
}

function main(): never {
  const drift = [renderedColoursAreTheTheme(), italicIsTheThemes()].filter(
    isDrift
  )

  return exitWith(drift)
}

function renderedColoursAreTheTheme(): Drift | null {
  const rendered = distinctMatches(TOKEN_COLOUR)
  if (rendered.length === 0) {
    refuse(`${DIST_DOCS_LABEL} has no highlighted code block in it`)
  }

  return driftBetween(
    `the built pages must render the token colours ${THEME_MODULE} exports and no others`,
    TOKEN_COLOURS.filter((hex) => !rendered.includes(hex)),
    rendered.filter((hex) => !TOKEN_COLOURS.includes(hex))
  )
}

function italicIsTheThemes(): Drift | null {
  const italic = distinctMatches(ITALIC_TOKEN)

  return driftBetween(
    `only the colours ${THEME_MODULE} sets italic may render italic`,
    ITALIC_COLOURS.filter((hex) => !italic.includes(hex)),
    italic.filter((hex) => !ITALIC_COLOURS.includes(hex))
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
    console.log(
      `syntax theme: ${TOKEN_COLOURS.length} token colours from ${THEME_MODULE}, all rendered`
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
