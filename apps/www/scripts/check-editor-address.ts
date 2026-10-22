/**
 * Holds the docs to the editor address in packages/cli/src/cli/consts.ts: the
 * site's `EDITOR_URL` path agrees, every address on this host is the editor's,
 * share links have `editorConfigUrl`'s shape, and a link whose text names the
 * host writes and targets the full address. Cannot see a host used as a name,
 * link text naming no address, or anything outside src/content/docs/.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

import { EDITOR_URL as SITE_EDITOR_PATH } from "../src/lib/links"

const CONSTS = fileURLToPath(
  new URL("../../../packages/cli/src/cli/consts.ts", import.meta.url)
)
const CONSTS_LABEL = "packages/cli/src/cli/consts.ts"

const LINKS_LABEL = "src/lib/links.ts"

const DOCS = fileURLToPath(new URL("../src/content/docs/", import.meta.url))
const DOCS_LABEL = "src/content/docs/"

const EDITOR_URL_CONSTANT = "EDITOR_URL"

/** `EDITOR_URL` yields to an environment variable; this literal is the address users get. */
const DEFAULT_EDITOR_URL_CONSTANT = "DEFAULT_EDITOR_URL"

const SHARE_LINK_FUNCTION = "editorConfigUrl"

const PAGE_EXTENSIONS = [".md", ".mdx"]

// Spans newlines, because a long link wraps.
const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)\s]*)\)/g

// So `api.agentsinc.sh` is not read as this host.
const HOSTNAME_CHARACTER = /[A-Za-z0-9.-]/

const URL_CONTINUES = /^[/?#]/

// So `/editorial` is not read as `/editor`.
const PATH_SEGMENT_CHARACTER = /[A-Za-z0-9_-]/

const TOKEN_HEAD = /[^\s`([]*$/
const TOKEN_TAIL = /^[^\s`)\],]*/

const SCHEME_SEPARATOR = "://"
const QUERY_SEPARATOR = "?"
const ROOT_PATH = "/"

type EditorAddress = {
  url: string
  host: string
  path: string
  /** Up to the id. */
  shareLink: string
  /** Finds a share link however the rest is spelled. */
  query: string
}

type Page = { label: string; text: string; lines: string[] }

type Written = {
  where: string
  wrote: string
  wanted: string
  agrees: boolean
}

type Drift = { claim: string; offences: Written[] }

type Judged = {
  pages: Page[]
  addresses: Written[]
  shareLinks: Written[]
  links: Written[]
}

function main(): void {
  const address = readEditorAddress()
  const judged = judge(readDocumentationPages(), address, SITE_EDITOR_PATH)

  if (judged.addresses.length === 0) {
    refuse(`no page under ${DOCS_LABEL} writes an address on ${address.host}`)
  }

  const drift = [
    driftIn("the two constants that spell the editor's address", [
      siteConstantAgainst(SITE_EDITOR_PATH, address),
    ]),
    driftIn("every address written on this site's own host", judged.addresses),
    driftIn("every share link written out", judged.shareLinks),
    driftIn("every link whose text names this site's host", judged.links),
  ].filter(isDrift)

  exitWith(drift, judged)
}

function judge(
  pages: Page[],
  address: EditorAddress,
  sitePath: string
): Judged {
  return {
    pages,
    addresses: pages.flatMap((page) => addressesIn(page, address)),
    shareLinks: pages.flatMap((page) => shareLinksIn(page, address)),
    links: pages.flatMap((page) => hostLinksIn(page, address, sitePath)),
  }
}

function readEditorAddress(): EditorAddress {
  const declared = parseModule(CONSTS, CONSTS_LABEL)
  const url = stringConstantIn(
    declared,
    DEFAULT_EDITOR_URL_CONSTANT,
    CONSTS_LABEL
  )
  const { host, path } = hostAndPathOf(url)
  const appended = whatShareLinksAppend(declared)

  return {
    url,
    host,
    path,
    shareLink: `${host}${path}${appended}`,
    query: queryWithin(appended),
  }
}

function hostAndPathOf(url: string): { host: string; path: string } {
  if (!URL.canParse(url)) {
    refuse(
      `'${DEFAULT_EDITOR_URL_CONSTANT}' in ${CONSTS_LABEL} is not a URL: ${url}`
    )
  }

  const { host, pathname } = new URL(url)
  if (pathname === ROOT_PATH) {
    refuse(
      `'${DEFAULT_EDITOR_URL_CONSTANT}' in ${CONSTS_LABEL} names no path below ${host}, ` +
        `so an address on that host cannot be told from the editor's`
    )
  }

  return { host, path: pathname }
}

/** Read from the template, not transcribed: the slash before `?` is what a reader drops. */
function whatShareLinksAppend(declared: ts.SourceFile): string {
  const built = returnedExpressionOf(declared)
  if (!ts.isTemplateExpression(built)) {
    refuse(
      `'${SHARE_LINK_FUNCTION}' in ${CONSTS_LABEL} builds no template literal`
    )
  }

  const [afterEditorUrl] = built.templateSpans
  if (
    built.head.text !== "" ||
    afterEditorUrl === undefined ||
    !isIdentifierNamed(afterEditorUrl.expression, EDITOR_URL_CONSTANT)
  ) {
    refuse(
      `'${SHARE_LINK_FUNCTION}' in ${CONSTS_LABEL} no longer opens with ` +
        `'${EDITOR_URL_CONSTANT}', so the shape of a share link cannot be read`
    )
  }

  return afterEditorUrl.literal.text
}

function returnedExpressionOf(declared: ts.SourceFile): ts.Expression {
  const built = declared.statements
    .filter(ts.isFunctionDeclaration)
    .find((candidate) => candidate.name?.text === SHARE_LINK_FUNCTION)
    ?.body?.statements.find(ts.isReturnStatement)?.expression
  if (built === undefined) {
    refuse(`${CONSTS_LABEL} declares no '${SHARE_LINK_FUNCTION}' that returns`)
  }

  return built
}

function queryWithin(appended: string): string {
  const opensAt = appended.indexOf(QUERY_SEPARATOR)
  if (opensAt === -1) {
    refuse(
      `'${SHARE_LINK_FUNCTION}' in ${CONSTS_LABEL} builds no query, so a share ` +
        `link has nothing this can find it by`
    )
  }

  return appended.slice(opensAt)
}

function siteConstantAgainst(
  sitePath: string,
  address: EditorAddress
): Written {
  return {
    where: `${LINKS_LABEL} · ${EDITOR_URL_CONSTANT}`,
    wrote: sitePath,
    wanted: address.path,
    agrees: sitePath === address.path,
  }
}

function stringConstantIn(
  declared: ts.SourceFile,
  constant: string,
  label: string
): string {
  const initializer = declared.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((candidate) =>
      isIdentifierNamed(candidate.name, constant)
    )?.initializer
  if (initializer === undefined) {
    refuse(`${label} declares no '${constant}'`)
  }
  if (!ts.isStringLiteralLike(initializer)) {
    refuse(`'${constant}' in ${label} is not a string literal`)
  }

  return initializer.text
}

function isIdentifierNamed(node: ts.Node, name: string): boolean {
  return ts.isIdentifier(node) && node.text === name
}

function parseModule(filePath: string, label: string): ts.SourceFile {
  if (!existsSync(filePath)) refuse(`there is no ${label}`)

  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf-8"),
    ts.ScriptTarget.Latest
  )
}

function readDocumentationPages(): Page[] {
  if (!existsSync(DOCS)) refuse(`there is no documentation at ${DOCS_LABEL}`)

  const pages = readdirSync(DOCS, { recursive: true, encoding: "utf8" })
    .filter(isPage)
    .map(readPage)
  if (pages.length === 0) refuse(`${DOCS_LABEL} holds no pages`)

  return pages
}

function isPage(entry: string): boolean {
  return PAGE_EXTENSIONS.some((extension) => entry.endsWith(extension))
}

function readPage(entry: string): Page {
  const text = readFileSync(join(DOCS, entry), "utf-8")

  return { label: `${DOCS_LABEL}${entry}`, text, lines: text.split("\n") }
}

/** A host is an address when a scheme precedes it or a path, query or fragment follows. */
function addressesIn(page: Page, address: EditorAddress): Written[] {
  return page.lines.flatMap((line, index) =>
    occurrencesOf(line, address.host)
      .filter((at) => isThisHost(line, at))
      .filter((at) => isWrittenAsUrl(line, at, address.host))
      .map((at) => ({
        where: lineLabel(page, index),
        wrote: tokenAround(line, at, at + address.host.length),
        wanted: `${address.host}${address.path}`,
        agrees: namesTheEditor(line.slice(at), address),
      }))
  )
}

function isThisHost(line: string, at: number): boolean {
  const before = line[at - 1]

  return before === undefined || !HOSTNAME_CHARACTER.test(before)
}

function isWrittenAsUrl(line: string, at: number, host: string): boolean {
  return (
    line.slice(0, at).endsWith(SCHEME_SEPARATOR) ||
    URL_CONTINUES.test(line.slice(at + host.length))
  )
}

function namesTheEditor(rest: string, address: EditorAddress): boolean {
  const editor = `${address.host}${address.path}`
  if (!rest.startsWith(editor)) return false

  const next = rest[editor.length]

  return next === undefined || !PATH_SEGMENT_CHARACTER.test(next)
}

/** Found by query alone, so a wrong host or path is still judged; a bare `?fromId=` is skipped. */
function shareLinksIn(page: Page, address: EditorAddress): Written[] {
  return page.lines.flatMap((line, index) =>
    occurrencesOf(line, address.query)
      .filter((at) => followsAnAddress(line, at))
      .map((at) => ({
        where: lineLabel(page, index),
        wrote: tokenAround(line, at, at + address.query.length),
        wanted: address.shareLink,
        agrees: line
          .slice(0, at + address.query.length)
          .endsWith(address.shareLink),
      }))
  )
}

function hostLinksIn(
  page: Page,
  address: EditorAddress,
  sitePath: string
): Written[] {
  return [...page.text.matchAll(MARKDOWN_LINK)]
    .filter((link) => textOf(link).includes(address.host))
    .map((link) => ({
      where: `${page.label}:${lineAt(page, link.index)}`,
      wrote: `[${textOf(link)}](${targetOf(link)})`,
      wanted: `[${address.host}${address.path}](${sitePath})`,
      agrees: isEditorLink(link, address, sitePath),
    }))
}

function isEditorLink(
  link: RegExpExecArray,
  address: EditorAddress,
  sitePath: string
): boolean {
  const named = addressWithin(textOf(link), address)
  const target = targetOf(link)

  return (
    namesTheEditor(named, address) &&
    (target === sitePath || target === address.url)
  )
}

function textOf(link: RegExpExecArray): string {
  return link[1] ?? ""
}

function targetOf(link: RegExpExecArray): string {
  return link[2] ?? ""
}

function addressWithin(text: string, address: EditorAddress): string {
  return text.slice(text.indexOf(address.host))
}

function occurrencesOf(line: string, needle: string): number[] {
  const found: number[] = []
  for (
    let at = line.indexOf(needle);
    at !== -1;
    at = line.indexOf(needle, at + needle.length)
  ) {
    found.push(at)
  }

  return found
}

/** The whole token, so a message shows an address, not a fragment. */
function tokenAround(line: string, from: number, to: number): string {
  const tail = TOKEN_TAIL.exec(line.slice(to))?.[0] ?? ""

  return `${tokenHeadBefore(line, from)}${line.slice(from, to)}${tail}`
}

function followsAnAddress(line: string, at: number): boolean {
  return tokenHeadBefore(line, at).length > 0
}

function tokenHeadBefore(line: string, at: number): string {
  return TOKEN_HEAD.exec(line.slice(0, at))?.[0] ?? ""
}

function lineLabel(page: Page, index: number): string {
  return `${page.label}:${index + 1}`
}

function lineAt(page: Page, offset: number): number {
  return page.text.slice(0, offset).split("\n").length
}

function driftIn(claim: string, written: Written[]): Drift | null {
  const offences = written.filter((one) => !one.agrees)

  return offences.length === 0 ? null : { claim, offences }
}

function isDrift(verdict: Drift | null): verdict is Drift {
  return verdict !== null
}

function exitWith(drift: Drift[], judged: Judged): never {
  if (drift.length === 0) {
    console.log(
      `editor address: ${judged.addresses.length} addresses, ` +
        `${judged.shareLinks.length} share links and ${judged.links.length} links ` +
        `across ${judged.pages.length} pages, all the editor's`
    )
    process.exit(0)
  }

  console.error(`editor address: ${DOCS_LABEL} and ${CONSTS_LABEL} disagree\n`)
  for (const { claim, offences } of drift) {
    console.error(`  ${claim}`)
    for (const { where, wrote, wanted } of offences) {
      console.error(`    · ${where}`)
      console.error(`        writes  ${wrote}`)
      console.error(`        wanted  ${wanted}`)
    }
  }
  console.error(
    `\n'${DEFAULT_EDITOR_URL_CONSTANT}' in ${CONSTS_LABEL} is where the editor is, and` +
      `\n'${SHARE_LINK_FUNCTION}' beside it is the shape of a share link.`
  )
  process.exit(1)
}

/** An empty read is the defect, not a pass. */
function refuse(reason: string): never {
  throw new Error(`editor address: ${reason}`)
}

main()
