/**
 * Holds the Releases section to the notes it is built from: one page per file
 * under packages/cli/changelogs/, at /docs/releases/<version>/, and no other;
 * each page's title is its notes' opening heading and its body the rest, word
 * for word; the sidebar's Releases group lists every release, newest first;
 * the sidebar no longer stands in for the section with GitHub's releases page;
 * and no link on a release page points at a site path nothing was built at.
 * Words, not markup: formatting, punctuation and link targets may differ, a
 * dropped, added or reordered word may not. Reads the notes and dist/, so
 * needs `astro build`. Its controls run first, and a broken read refuses.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"
import { gfm } from "micromark-extension-gfm"

const NOTES_DIR = fileURLToPath(
  new URL("../../../packages/cli/changelogs/", import.meta.url)
)

const NOTES_LABEL = "packages/cli/changelogs/"

const DIST = fileURLToPath(new URL("../dist/", import.meta.url))

// The version verbatim: a slugger drops the dots, and a page is named for its release.
const RELEASES_PATH = "/docs/releases/"

const RELEASES_GROUP = "Releases"

// Every page carries the whole sidebar; this one is built whatever else changes.
const SIDEBAR_PAGE = "docs/index.html"

// Written out rather than read from CHANGELOG_URL, so deleting the constant
// cannot take this check's subject with it.
const GITHUB_RELEASES = "https://github.com/agents-inc/agents-inc/releases"

const STAND_IN_LABEL = "Changelog"

/**
 * A built page whose source is plain Markdown carrying links, a table and
 * headings, and a second source it must not read as: the comparison has to
 * say yes to the one and no to the other before its verdicts mean anything.
 */
const CONTROL = {
  page: "docs/recipes/index.html",
  source: "src/content/docs/docs/recipes/index.md",
  otherSource: "src/content/docs/docs/troubleshooting/index.md",
}

const NOTES_FILE = /^(\d+)\.(\d+)\.(\d+)\.md$/

const WORD = /[\p{L}\p{N}]+/gu

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/

const FRONTMATTER_TITLE = /^title:\s*(.+?)\s*$/m

// Quoted values may hold `>`; Expressive Code's copy button carries code in one.
const TAG = /<(\/?)([a-zA-Z][\w-]*)(?:[^>"']|"[^"]*"|'[^']*')*>/g

const COMMENT = /<!--[\s\S]*?-->/g

const SCRIPT_OR_STYLE = /<(script|style)\b[\s\S]*?<\/\1>/gi

// Starlight's "Section titled …" beside each heading: the page's, not the notes'.
const SCREEN_READER_ONLY =
  /<span\b[^>]*\bclass="[^"]*\bsr-only\b[^"]*"[^>]*>[^<]*<\/span>/g

const MARKDOWN_CONTENT =
  /<div\b[^>]*\bclass="[^"]*\bsl-markdown-content\b[^"]*"[^>]*>/

const HEADING_1 = /<h1\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/h1>/g

const ANCHOR = /<a\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/a>/g

const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i

const SUMMARY = /<summary\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/summary>/

const DETAILS_START = /<details(?=[\s/>])/g

const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

/** Their boundaries are whitespace on a page; an inline element's are not. */
const HTML_BLOCKS = new Set([
  "address",
  "aside",
  "blockquote",
  "br",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
])

const MARKDOWN_BLOCKS = new Set([
  "blockquote",
  "break",
  "code",
  "footnoteDefinition",
  "heading",
  "list",
  "listItem",
  "paragraph",
  "table",
  "tableCell",
  "tableRow",
  "thematicBreak",
])

// Links a reader follows off the site, or within the page.
const NOT_A_SITE_PATH = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

const SITE_ORIGIN = "https://agentsinc.sh"

const OFFENCES_LISTED = 5

const CONTEXT_WORDS = 8

type MarkdownNode = {
  type: string
  value?: string
  alt?: string | null | undefined
  depth?: number
  children?: MarkdownNode[]
}

type Release = {
  version: string
  rank: [number, number, number]
  heading: string[]
  body: string[]
  links: number
}

type BuiltPage = {
  titles: string[][]
  body: { words: string[]; hrefs: string[] } | undefined
}

type SidebarLink = { href: string; label: string }

type ReleaseLink = SidebarLink & { version: string }

type Sidebar = {
  groups: string[]
  links: SidebarLink[]
  releases: ReleaseLink[] | undefined
}

type Check = { holds: string; offences: string[] }

function main(): never {
  const releases = readNotes().sort(newestFirst)
  const sidebar = readSidebar()
  holdTheControls(releases, sidebar)

  return exitWith([
    everyNotesFileHasAPage(releases),
    noPageWithoutNotes(releases),
    everyPageReadsAsItsNotes(releases),
    theSidebarListsEveryReleaseNewestFirst(releases, sidebar),
    theGithubStandInIsGone(sidebar),
    noReleasePageLinksNowhere(releases),
  ])
}

function everyNotesFileHasAPage(releases: Release[]): Check {
  return {
    holds: `every notes file under ${NOTES_LABEL} has a page at ${RELEASES_PATH}<version>/`,
    offences: releases
      .filter((release) => !existsSync(join(DIST, pageFileOf(release.version))))
      .map(
        ({ version }) =>
          `${version} has no page: dist/${pageFileOf(version)} was not built`
      ),
  }
}

function noPageWithoutNotes(releases: Release[]): Check {
  const versions = new Set(releases.map((release) => release.version))
  const built = join(DIST, RELEASES_PATH)
  const pages = existsSync(built)
    ? readdirSync(built, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : []

  return {
    holds: `every page under ${RELEASES_PATH} has a notes file`,
    offences: pages
      .filter((page) => !versions.has(page))
      .map(
        (page) =>
          `${RELEASES_PATH}${page}/ was built, and ${NOTES_LABEL} holds no ${page}.md`
      ),
  }
}

function everyPageReadsAsItsNotes(releases: Release[]): Check {
  const built = releases.filter((release) =>
    existsSync(join(DIST, pageFileOf(release.version)))
  )
  const holds =
    "every release page's title is its notes' heading and its body the rest of its notes, word for word"
  if (built.length === 0) {
    return {
      holds,
      offences: ["no release page was built, so no page was compared"],
    }
  }

  return { holds, offences: built.flatMap(mismatchesOf) }
}

function mismatchesOf(release: Release): string[] {
  const where = `${RELEASES_PATH}${release.version}/`
  const page = readBuiltPage(pageFileOf(release.version))
  const [title, ...otherTitles] = page.titles
  const titleProblem =
    title === undefined
      ? "has no <h1>"
      : otherTitles.length > 0
        ? `has ${page.titles.length} <h1> elements; the notes' heading is its one title`
        : describeDifference(release.heading, title, "heading")
  const bodyProblem =
    page.body === undefined
      ? "has no Markdown content element"
      : describeDifference(release.body, page.body.words, "body")

  return [titleProblem, bodyProblem]
    .filter((problem) => problem !== undefined)
    .map((problem) => `${where} ${problem}`)
}

function theSidebarListsEveryReleaseNewestFirst(
  releases: Release[],
  sidebar: Sidebar
): Check {
  const holds = `the sidebar's ${RELEASES_GROUP} group lists every release, newest first`
  if (sidebar.releases === undefined) {
    return {
      holds,
      offences: [
        `dist/${SIDEBAR_PAGE}'s sidebar has no "${RELEASES_GROUP}" group; its groups are ${sidebar.groups.map((group) => `"${group}"`).join(", ")}`,
      ],
    }
  }

  const expected = releases.map((release) => release.version)
  const listed = sidebar.releases.map(({ version }) => version)
  const missing = expected.filter((version) => !listed.includes(version))
  const strays = sidebar.releases.filter(
    ({ version }) => !expected.includes(version)
  )
  const misplaced = expected.findIndex(
    (version, index) => listed[index] !== version
  )
  const mislabelled = sidebar.releases.filter(
    ({ version, label }) => !label.includes(version)
  )

  return {
    holds,
    offences: [
      ...missing.map((version) => `${version} is not listed in the group`),
      ...strays.map(
        ({ href, label }) =>
          `"${label}" (${href}) is listed and names no notes file`
      ),
      ...(missing.length === 0 && strays.length === 0 && misplaced !== -1
        ? [
            `the order breaks at entry ${misplaced + 1}: expected ${expected[misplaced]}, found ${listed[misplaced] ?? "(nothing)"}`,
          ]
        : []),
      ...mislabelled.map(
        ({ href, label }) =>
          `"${label}" links ${href} and does not name its version`
      ),
    ],
  }
}

function theGithubStandInIsGone(sidebar: Sidebar): Check {
  const githubLinks = sidebar.links.filter(({ href }) =>
    href.startsWith(GITHUB_RELEASES)
  )
  const standIns = sidebar.links.filter(({ label }) => label === STAND_IN_LABEL)

  return {
    holds: `the sidebar stands in for no Releases section: no link to ${GITHUB_RELEASES}, and a "${STAND_IN_LABEL}" entry, if any, opens a built page of the section that nothing else in the sidebar opens`,
    offences: [
      ...githubLinks.map(
        ({ label }) =>
          `the sidebar still links GitHub's releases page, as "${label}"`
      ),
      ...standIns
        .filter(({ href }) => !href.startsWith(GITHUB_RELEASES))
        .flatMap(({ href }) => standInProblems(href, sidebar.links)),
    ],
  }
}

function standInProblems(href: string, links: SidebarLink[]): string[] {
  const path = sitePathOf(href, "/")
  const entry = `"${STAND_IN_LABEL}" (${href})`
  if (path === undefined || !path.startsWith(RELEASES_PATH)) {
    return [`${entry} does not open the Releases section`]
  }
  if (builtFileFor(path) === undefined)
    return [`${entry} opens nothing that was built`]

  const sameTarget = links.filter(
    (link) =>
      trailingSlashless(sitePathOf(link.href, "/") ?? "") ===
      trailingSlashless(path)
  )
  return sameTarget.length > 1
    ? [`${entry} opens a page another sidebar entry already opens`]
    : []
}

function noReleasePageLinksNowhere(releases: Release[]): Check {
  const built = releases.filter((release) =>
    existsSync(join(DIST, pageFileOf(release.version)))
  )
  const holds =
    "no link on a release page points at a site path nothing was built at"
  if (built.length === 0) {
    return {
      holds,
      offences: ["no release page was built, so no link was followed"],
    }
  }

  const pages = built.map((release) => ({
    release,
    hrefs: readBuiltPage(pageFileOf(release.version)).body?.hrefs ?? [],
  }))
  const notesLinks = built.reduce((sum, release) => sum + release.links, 0)
  const pageLinks = pages.reduce((sum, page) => sum + page.hrefs.length, 0)
  if (notesLinks > 0 && pageLinks === 0) {
    return {
      holds,
      offences: [
        `the built pages' notes hold ${notesLinks} link(s) and the pages none: the read is broken, or the links were dropped`,
      ],
    }
  }

  return {
    holds,
    offences: pages.flatMap(({ release, hrefs }) => {
      const at = `${RELEASES_PATH}${release.version}/`
      return hrefs
        .filter((href) => {
          const path = sitePathOf(href, at)
          return path !== undefined && builtFileFor(path) === undefined
        })
        .map(
          (href) =>
            `${at} links ${href}, and nothing was built at ${sitePathOf(href, at) ?? href}`
        )
    }),
  }
}

/** The comparison must accept a page against its own source and refuse it against another's. */
function holdTheControls(releases: Release[], sidebar: Sidebar): void {
  const page = readBuiltPage(CONTROL.page)
  const own = readDocsSource(CONTROL.source)
  const other = readDocsSource(CONTROL.otherSource)
  if (page.body === undefined) {
    refuse(`control: dist/${CONTROL.page} has no Markdown content element`)
  }

  const [title, ...otherTitles] = page.titles
  const problem =
    title === undefined || otherTitles.length > 0
      ? `holds ${page.titles.length} <h1> elements where it should hold one`
      : (describeDifference(own.title, title, "title") ??
        describeDifference(own.body, page.body.words, "body"))
  if (problem !== undefined) {
    refuse(
      `control: dist/${CONTROL.page} does not read as ${CONTROL.source}: it ${problem}. The comparison is broken, so no verdict below would mean anything`
    )
  }
  if (describeDifference(other.body, page.body.words, "body") === undefined) {
    refuse(
      `control: dist/${CONTROL.page} reads as ${CONTROL.otherSource} too, so the comparison cannot tell two pages apart`
    )
  }

  console.log(
    `release pages: control: dist/${CONTROL.page} reads as ${CONTROL.source} (${page.body.words.length} words) and not as ${CONTROL.otherSource}`
  )
  console.log(
    `release pages: control: ${releases.length} notes files read, ${releases.at(-1)?.version ?? ""} to ${releases[0]?.version ?? ""}; the sidebar of dist/${SIDEBAR_PAGE} read, ${sidebar.groups.length} groups and ${sidebar.links.length} links`
  )
}

function readNotes(): Release[] {
  if (!existsSync(NOTES_DIR)) refuse(`${NOTES_LABEL} not found at ${NOTES_DIR}`)

  const files = readdirSync(NOTES_DIR).filter((file) => file.endsWith(".md"))
  if (files.length === 0) refuse(`${NOTES_LABEL} holds no notes file`)
  return files.map(releaseFrom)
}

function releaseFrom(file: string): Release {
  const name = NOTES_FILE.exec(file)
  if (name === null) {
    refuse(
      `${NOTES_LABEL}${file} is not named for a version, so no page can be named for it`
    )
  }

  const [, major = "", minor = "", patch = ""] = name
  const [opening, ...rest] = parseMarkdown(
    readFileSync(join(NOTES_DIR, file), "utf8")
  )
  if (opening?.type !== "heading" || opening.depth !== 1) {
    refuse(
      `${NOTES_LABEL}${file} does not open with a level-1 heading, so it names no title`
    )
  }

  return {
    version: file.slice(0, -".md".length),
    rank: [Number(major), Number(minor), Number(patch)],
    heading: wordsOf(visibleText(opening)),
    body: wordsOf(rest.map(visibleText).join(" ")),
    links: rest.reduce((sum, node) => sum + linkNodesIn(node), 0),
  }
}

function readDocsSource(relative: string): { title: string[]; body: string[] } {
  const source = readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8"
  )
  const frontmatter = FRONTMATTER.exec(source)
  const title =
    frontmatter?.[1] === undefined
      ? undefined
      : FRONTMATTER_TITLE.exec(frontmatter[1])?.[1]
  if (frontmatter === null || title === undefined) {
    refuse(`control: ${relative} has no frontmatter title`)
  }

  return {
    title: wordsOf(title),
    body: wordsOf(
      parseMarkdown(source.slice(frontmatter[0].length))
        .map(visibleText)
        .join(" ")
    ),
  }
}

function readSidebar(): Sidebar {
  const file = join(DIST, SIDEBAR_PAGE)
  if (!existsSync(DIST))
    refuse(`dist/ not found at ${DIST} — run \`astro build\` first`)
  if (!existsSync(file))
    refuse(`dist/${SIDEBAR_PAGE} not found, so there is no sidebar to read`)

  const html = readFileSync(file, "utf8")
  const start = html.search(/<sl-sidebar-state-persist(?=[\s/>])/)
  const sidebar =
    start === -1 ? undefined : innerOf(html, "sl-sidebar-state-persist", start)
  if (sidebar === undefined)
    refuse(`dist/${SIDEBAR_PAGE} holds no sidebar element`)

  const groups = [...sidebar.matchAll(DETAILS_START)].map((match) => {
    const inner = innerOf(sidebar, "details", match.index) ?? ""
    return {
      label: collapse(textOfHtml(SUMMARY.exec(inner)?.[1] ?? "")),
      inner,
    }
  })
  const links = anchorsIn(sidebar)
  if (groups.length === 0 || links.length === 0) {
    refuse(
      `dist/${SIDEBAR_PAGE}'s sidebar read no group or no link; the read is broken`
    )
  }

  const releasesGroup = groups.find((group) => group.label === RELEASES_GROUP)
  return {
    groups: groups.map((group) => group.label),
    links,
    releases:
      releasesGroup === undefined
        ? undefined
        : anchorsIn(releasesGroup.inner).flatMap(({ href, label }) => {
            const version = versionLinkedBy(href)
            return version === undefined ? [] : [{ href, label, version }]
          }),
  }
}

function readBuiltPage(relative: string): BuiltPage {
  const file = join(DIST, relative)
  if (!existsSync(file))
    refuse(`dist/${relative} not found — run \`astro build\` first`)

  const html = readFileSync(file, "utf8")
  const titles = [...html.matchAll(HEADING_1)].map(([, inner = ""]) =>
    wordsOf(textOfHtml(inner))
  )
  const start = html.search(MARKDOWN_CONTENT)
  const content = start === -1 ? undefined : innerOf(html, "div", start)

  return {
    titles,
    body:
      content === undefined
        ? undefined
        : {
            words: wordsOf(textOfHtml(content)),
            hrefs: anchorsIn(content).map(({ href }) => href),
          },
  }
}

/** The inner HTML of the element whose start tag begins at `start`, nesting counted. */
function innerOf(
  html: string,
  name: string,
  start: number
): string | undefined {
  const rest = html.slice(start)
  const tags = new RegExp(
    `<(/?)${name}(?=[\\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>`,
    "gi"
  )
  let depth = 0
  let opened = 0
  for (const match of rest.matchAll(tags)) {
    if (match[1] !== "/") {
      if (depth === 0) opened = match.index + match[0].length
      depth += 1
      continue
    }
    depth -= 1
    if (depth === 0) return rest.slice(opened, match.index)
  }
  return undefined
}

function linkNodesIn(node: MarkdownNode): number {
  return (
    (node.type === "link" ? 1 : 0) +
    (node.children ?? []).reduce((sum, child) => sum + linkNodesIn(child), 0)
  )
}

function anchorsIn(html: string): SidebarLink[] {
  return [...html.matchAll(ANCHOR)].flatMap(
    ([, attributes = "", inner = ""]) => {
      const href = HREF.exec(attributes)
      const value = href?.[1] ?? href?.[2] ?? href?.[3]
      return value === undefined
        ? []
        : [{ href: decodeEntities(value), label: collapse(textOfHtml(inner)) }]
    }
  )
}

function parseMarkdown(source: string): MarkdownNode[] {
  return fromMarkdown(source, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }).children
}

/**
 * What a reader is shown: text and code as written, raw HTML as written (a page
 * that swallows it as markup has dropped words), and a link's text without its
 * target.
 */
function visibleText(node: MarkdownNode): string {
  const own =
    node.value ??
    (node.type === "image"
      ? (node.alt ?? "")
      : (node.children ?? []).map(visibleText).join(""))
  return MARKDOWN_BLOCKS.has(node.type) ? ` ${own} ` : own
}

function textOfHtml(html: string): string {
  return decodeEntities(
    html
      .replace(SCRIPT_OR_STYLE, "")
      .replace(COMMENT, "")
      .replace(SCREEN_READER_ONLY, "")
      .replace(TAG, (_tag: string, _slash: string, name: string) =>
        HTML_BLOCKS.has(name.toLowerCase()) ? " " : ""
      )
  )
}

function decodeEntities(text: string): string {
  return text.replace(ENTITY, (entity: string, name: string) => {
    const lower = name.toLowerCase()
    if (lower.startsWith("#x"))
      return String.fromCodePoint(parseInt(lower.slice(2), 16))
    if (lower.startsWith("#"))
      return String.fromCodePoint(parseInt(lower.slice(1), 10))
    return NAMED_ENTITIES[lower] ?? entity
  })
}

function wordsOf(text: string): string[] {
  return text.match(WORD) ?? []
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/** Where two word sequences part, with a few words of each side; undefined when they agree. */
function describeDifference(
  expected: string[],
  found: string[],
  part: string
): string | undefined {
  const parted = expected.findIndex((word, index) => found[index] !== word)
  const at =
    parted !== -1
      ? parted
      : expected.length === found.length
        ? -1
        : expected.length
  if (at === -1) return undefined

  return `differs from its ${part} at word ${at + 1} of ${expected.length}: the source reads "${excerpt(expected, at)}", the page "${excerpt(found, at)}"`
}

function excerpt(words: string[], at: number): string {
  const shown = words.slice(at, at + CONTEXT_WORDS).join(" ")
  return shown === "" ? "(end)" : shown
}

function versionLinkedBy(href: string): string | undefined {
  const path = sitePathOf(href, "/")
  if (path === undefined || !path.startsWith(RELEASES_PATH)) return undefined
  const version = trailingSlashless(path.slice(RELEASES_PATH.length))
  return NOTES_FILE.test(`${version}.md`) ? version : undefined
}

/** The site path an href opens from the page at `from`; undefined when it leaves the site. */
function sitePathOf(href: string, from: string): string | undefined {
  if (NOT_A_SITE_PATH.test(href)) return undefined
  const url = new URL(href, `${SITE_ORIGIN}${from}`)
  return url.origin === SITE_ORIGIN
    ? decodeURIComponent(url.pathname)
    : undefined
}

/** The dist/ file a site path is served from, as Astro's directory format writes it. */
function builtFileFor(path: string): string | undefined {
  const candidates = path.endsWith("/")
    ? [`${path}index.html`]
    : [path, `${path}/index.html`, `${path}.html`]
  return candidates.find((candidate) => {
    const file = join(DIST, candidate)
    return existsSync(file) && statSync(file).isFile()
  })
}

function trailingSlashless(path: string): string {
  return path.replace(/\/+$/, "")
}

function pageFileOf(version: string): string {
  return `${RELEASES_PATH.slice(1)}${version}/index.html`
}

function newestFirst(a: Release, b: Release): number {
  return b.rank[0] - a.rank[0] || b.rank[1] - a.rank[1] || b.rank[2] - a.rank[2]
}

function exitWith(checks: Check[]): never {
  const failed = checks.filter((check) => check.offences.length > 0)
  for (const { holds, offences } of checks) {
    if (offences.length === 0) {
      console.log(`release pages: holds: ${holds}`)
      continue
    }
    console.error(`release pages: FAILS (${offences.length}): ${holds}`)
    for (const offence of offences.slice(0, OFFENCES_LISTED))
      console.error(`  · ${offence}`)
    if (offences.length > OFFENCES_LISTED) {
      console.error(`  · and ${offences.length - OFFENCES_LISTED} more`)
    }
  }

  if (failed.length === 0) process.exit(0)
  console.error(
    `\nrelease pages: ${failed.length} of ${checks.length} checks fail. The section is built from` +
      `\n${NOTES_LABEL} when the site builds; a page is never written by hand.`
  )
  process.exit(1)
}

/** An empty or broken read is the defect, not a pass. */
function refuse(reason: string): never {
  throw new Error(`release pages: ${reason}`)
}

main()
