/**
 * Holds that every built link opening a new tab (`target="_blank"` on an `<a>`
 * or `<area>`) carries both `noopener` and `noreferrer` in its own `rel`, so
 * the opened page gets no `window.opener` and no Referer. Per element, in any
 * attribute order and quoting. Cannot see `<base target>`, a form's target or
 * `window.open`. Reads `dist/`, so needs `astro build`.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const DIST = fileURLToPath(new URL("../dist/", import.meta.url))

// Written out rather than read from EXTERNAL_LINK_ATTRS, so weakening the
// constant reddens this check instead of moving it.
const REQUIRED_REL_TOKENS = ["noopener", "noreferrer"]

const NEW_TAB = "_blank"

// Quoted values may hold `>`.
const LINK_START_TAG = /<(?:a|area)(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/gi

const ATTRIBUTE =
  /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

const ASCII_WHITESPACE = /[\t\n\f\r ]+/

const PAGES_NAMED_PER_LINK = 3

type NewTabLink = { page: string; href: string; rel: string }

type Offence = { href: string; rel: string; missing: string[]; pages: string[] }

function main(): never {
  const links = builtPages().flatMap(newTabLinksOn)
  if (links.length === 0) {
    refuse(
      "found no link opening a new tab, yet the site's external links all do; the read is broken"
    )
  }

  return exitWith(links, offencesAmong(links))
}

function newTabLinksOn(page: string): NewTabLink[] {
  const html = readFileSync(join(DIST, page), "utf8")

  return [...html.matchAll(LINK_START_TAG)]
    .map(([, attributes = ""]) => attributesOf(attributes))
    .filter(opensANewTab)
    .map((attributes) => ({
      page,
      href: attributes.get("href") ?? "(no href)",
      rel: attributes.get("rel") ?? "",
    }))
}

/** The first of a repeated attribute wins, as in a browser. */
function attributesOf(source: string): Map<string, string> {
  const attributes = new Map<string, string>()
  for (const [, name = "", double, single, bare] of source.matchAll(
    ATTRIBUTE
  )) {
    const key = name.toLowerCase()
    if (!attributes.has(key))
      attributes.set(key, double ?? single ?? bare ?? "")
  }
  return attributes
}

function opensANewTab(attributes: Map<string, string>): boolean {
  return attributes.get("target")?.trim().toLowerCase() === NEW_TAB
}

function missingTokens(rel: string): string[] {
  const tokens = rel.toLowerCase().split(ASCII_WHITESPACE)
  return REQUIRED_REL_TOKENS.filter((token) => !tokens.includes(token))
}

/** One entry per distinct link, so a shared header that regresses reads once. */
function offencesAmong(links: NewTabLink[]): Offence[] {
  const byLink = new Map<string, Offence>()
  for (const { page, href, rel } of links) {
    const missing = missingTokens(rel)
    if (missing.length === 0) continue

    const key = `${href}\n${rel}`
    const offence = byLink.get(key) ?? { href, rel, missing, pages: [] }
    offence.pages.push(page)
    byLink.set(key, offence)
  }
  return [...byLink.values()]
}

function describe({ href, rel, missing, pages }: Offence): string {
  const relText = rel === "" ? "no rel" : `rel="${rel}"`
  const named = pages
    .slice(0, PAGES_NAMED_PER_LINK)
    .map((page) => `dist/${page}`)
  const more = pages.length - named.length
  const where =
    more > 0 ? `${named.join(", ")} and ${more} more` : named.join(", ")

  return `${href} opens a new tab with ${relText}, missing ${missing.join(" and ")}, on ${pages.length} page(s): ${where}`
}

function builtPages(): string[] {
  if (!existsSync(DIST))
    refuse(`dist/ not found at ${DIST} — run \`astro build\` first`)

  const pages = readdirSync(DIST, { recursive: true, encoding: "utf8" }).filter(
    (entry) => entry.endsWith(".html")
  )
  if (pages.length === 0) refuse("dist/ holds no HTML page")
  return pages
}

function exitWith(links: NewTabLink[], offences: Offence[]): never {
  const required = `rel="${REQUIRED_REL_TOKENS.join(" ")}"`

  if (offences.length === 0) {
    const pages = new Set(links.map((link) => link.page)).size
    console.log(
      `new-tab links: all ${links.length} links opening a new tab, on ${pages} page(s), carry ${required}`
    )
    process.exit(0)
  }

  console.error(
    `new-tab links: ${offences.length} link(s) without ${required}\n`
  )
  for (const offence of offences) console.error(`  · ${describe(offence)}`)
  console.error(
    `\nGive each one ${required}: spread EXTERNAL_LINK_ATTRS from` +
      "\napps/www/src/lib/links.ts onto the anchor, or give it as a Starlight" +
      "\nsidebar entry's `attrs`."
  )
  process.exit(1)
}

/** An empty read is the defect, not a pass. */
function refuse(reason: string): never {
  throw new Error(`new-tab links: ${reason}`)
}

main()
