/**
 * The fourth thing this site cannot see about itself: whether the address it
 * gives for the editor is the address the editor is at.
 *
 * WHY THIS EXISTS. The editor used to be the apex. It is now `/editor` on the
 * same hostname — a Cloudflare Route on its own Worker, decided under WWW-03 —
 * and when it moved, thirty references across twenty-one documentation pages
 * stayed pointing at the apex. Every gate here stayed green: `astro build`
 * builds a page whose links are wrong, `astro check` reads types and a link is
 * a string, `eslint` reads syntax, and the other three checks read the type
 * scale, the fonts and the syntax theme. They were found by a hand sweep.
 *
 * A wrong one does not 404, which is the whole problem. `agentsinc.sh` serves
 * the landing page, so a reader sent there arrives somewhere that renders,
 * knows nothing about `?fromId=`, and does not say it is the wrong place. The
 * defect fails as a reader's confusion, and confusion has no exit code.
 *
 * The same class had already bitten the CLI's own suite —
 * `e2e/commands/init-ui.e2e.test.ts` asserted `toContain("agentsinc.sh")` and
 * `src/cli/utils/open-url.test.ts` hardcoded the share link — and both stayed
 * green across the split. Both were fixed by DERIVING rather than typing, and
 * that is what this pushes the documentation towards too.
 *
 * WHAT IT CHECKS, as four claims about one address:
 *
 *   1. THE TWO CONSTANTS THAT SPELL IT AGREE. `EDITOR_URL` in
 *      packages/cli/src/cli/consts.ts is the absolute address; `EDITOR_URL` in
 *      this site's src/lib/links.ts is the same address as a path on its own
 *      host. Nothing has ever held the second to the first, which is the
 *      headline of the row this exists for: every relative `/editor` link on
 *      the site is correct only because those two strings happen to match.
 *
 *   2. EVERY ADDRESS THE DOCUMENTATION WRITES ON THIS SITE'S OWN HOST IS THE
 *      EDITOR'S. The editor is the only thing on this host the documentation
 *      sends a reader to by hostname — everything else on the site is linked
 *      by path, because an absolute self-link breaks in `astro dev` and in
 *      `astro preview`. So a hostname written out with a scheme in front of it
 *      or a path behind it is an editor address, and must carry the segment.
 *
 *   3. EVERY SHARE LINK IS THE SHAPE `editorConfigUrl` BUILDS. Read from that
 *      function's own template literal, so the slash before `?` is derived
 *      rather than transcribed: `editorConfigUrl` interpolates
 *      `${EDITOR_URL}/?fromId=`, and a reader trimming that slash as redundant
 *      writes an address claim 2 cannot tell from a correct one.
 *
 *   4. EVERY LINK WHOSE TEXT NAMES THIS HOST WRITES THE FULL ADDRESS AND
 *      TARGETS IT. `[agentsinc.sh/editor](/editor)` — both halves, because the
 *      two rot separately and a link whose text and target disagree is a lie
 *      told twice.
 *
 * WHAT IT BINDS TO. `EDITOR_URL` and `editorConfigUrl` in
 * packages/cli/src/cli/consts.ts, through the TypeScript AST, and `EDITOR_URL`
 * in this site's src/lib/links.ts the same way. Nothing is transcribed: the
 * host, the path segment and the query the share link carries are all read out
 * of those two files, so moving the editor to `/studio` reddens this on the
 * next run rather than on the next hand sweep. It reads SOURCE on both sides
 * and no build output, for the reason check-cli-claims.ts gives.
 *
 * WHAT IT DELIBERATELY CANNOT SEE, said plainly because a checker's silence is
 * read as a pass:
 *
 *   · A HOST OR A QUERY USED AS A NAME RATHER THAN AS AN ADDRESS. `the
 *     agentsinc.sh store` is the config store and is correct; `opens it at
 *     agentsinc.sh` was one of the thirty and is wrong. They are the same bytes
 *     in the same shape, and only English separates them. Five of the thirty
 *     were this form. The same holds for a bare `` `?fromId=` ``, which three
 *     reference pages write as the NAME of the parameter with no address in
 *     front of it — there is nothing there to judge. An allowlist of the
 *     innocent ones would fail on the first rewording and get this switched
 *     off, which is worse than not looking.
 *
 *   · A LINK WHOSE TEXT NAMES NO ADDRESS. `[editor](/editor)` is bound to
 *     nothing here — claim 4 needs the text to name the host. Its DEFECT form,
 *     `[editor](https://agentsinc.sh)`, is caught by claim 2, so the split
 *     itself was covered; a later typo in the relative path would not be. That
 *     wants a link checker over the built site, which is a different check.
 *
 *   · THE WORDING OF QUOTED CLI OUTPUT. Three pages reproduce blocks the CLI
 *     prints. The ADDRESS inside those blocks is claim 2's and claim 3's; that
 *     `Install it:` is still spelled `Install it:` is a separate claim about
 *     `sharedConfigDestinations`, and this does not make it.
 *
 *   · ANYTHING OUTSIDE src/content/docs/. astro.config.ts names the apex on
 *     purpose — it is the landing page — and would fail claim 2 if it were
 *     read. The documentation is the surface that went stale.
 *
 * A CHECK THAT JUDGES NOTHING IS A FAILURE, NOT A PASS. A missing constants
 * file, a constant that is not a string, a share-link builder in a shape no
 * reader can resolve, an editor URL with no path below the host, a missing
 * documentation tree, a tree with no pages, and a documentation set that names
 * the editor's host nowhere at all — all refuse loudly.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

/** The CLI's own definition of where the editor is. */
const CONSTS = fileURLToPath(
  new URL("../../../packages/cli/src/cli/consts.ts", import.meta.url)
)
const CONSTS_LABEL = "packages/cli/src/cli/consts.ts"

/** This site's definition of the same address, as a path on its own host. */
const LINKS = fileURLToPath(new URL("../src/lib/links.ts", import.meta.url))
const LINKS_LABEL = "src/lib/links.ts"

/** The pages that write both of them out by hand. */
const DOCS = fileURLToPath(new URL("../src/content/docs/", import.meta.url))
const DOCS_LABEL = "src/content/docs/"

/** The constant both files declare, under the same name, for the same thing. */
const EDITOR_URL_CONSTANT = "EDITOR_URL"

/** The function that builds a share link out of it. */
const SHARE_LINK_FUNCTION = "editorConfigUrl"

const PAGE_EXTENSIONS = [".md", ".mdx"]

/** A markdown link. Spans newlines, because a long one wraps. */
const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)\s]*)\)/g

/** What a hostname is made of, so `api.agentsinc.sh` is not read as this host. */
const HOSTNAME_CHARACTER = /[A-Za-z0-9.-]/

/** What follows a host in a URL, and in nothing else. */
const URL_CONTINUES = /^[/?#]/

/** What a path segment is made of, so `/editorial` is not read as `/editor`. */
const PATH_SEGMENT_CHARACTER = /[A-Za-z0-9_-]/

/** The two halves of the token a span falls in, for a message a reader can grep. */
const TOKEN_HEAD = /[^\s`([]*$/
const TOKEN_TAIL = /^[^\s`)\],]*/

const SCHEME_SEPARATOR = "://"
const QUERY_SEPARATOR = "?"
const ROOT_PATH = "/"

/** The editor's address, as the two constants define it between them. */
type EditorAddress = {
  url: string
  host: string
  path: string
  /** The whole of a share link up to its id: host, path, and the query. */
  shareLink: string
  /** The query alone, which is how a share link is found however it is spelled. */
  query: string
}

/** One page, kept whole so an offence can name a line a reader opens. */
type Page = { label: string; text: string; lines: string[] }

/** One thing a file writes, and whether it is what the constants say. */
type Written = {
  where: string
  wrote: string
  wanted: string
  agrees: boolean
}

/** One claim's answer. A claim that agrees produces nothing to report. */
type Drift = { claim: string; offences: Written[] }

/** Everything this run looked at, so a pass can say what it judged. */
type Judged = {
  pages: Page[]
  addresses: Written[]
  shareLinks: Written[]
  links: Written[]
}

function main(): void {
  const address = readEditorAddress()
  const sitePath = readSiteEditorPath()
  const judged = judge(readDocumentationPages(), address, sitePath)

  if (judged.addresses.length === 0) {
    refuse(`no page under ${DOCS_LABEL} writes an address on ${address.host}`)
  }

  const drift = [
    driftIn("the two constants that spell the editor's address", [
      siteConstantAgainst(sitePath, address),
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

/**
 * The address the CLI holds, taken apart into the pieces a page writes: the
 * host on its own, the path segment that must follow it, and the share link's
 * prefix up to the id.
 */
function readEditorAddress(): EditorAddress {
  const declared = parseModule(CONSTS, CONSTS_LABEL)
  const url = stringConstantIn(declared, EDITOR_URL_CONSTANT, CONSTS_LABEL)
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
    refuse(`'${EDITOR_URL_CONSTANT}' in ${CONSTS_LABEL} is not a URL: ${url}`)
  }

  const { host, pathname } = new URL(url)
  if (pathname === ROOT_PATH) {
    refuse(
      `'${EDITOR_URL_CONSTANT}' in ${CONSTS_LABEL} names no path below ${host}, ` +
        `so an address on that host cannot be told from the editor's`
    )
  }

  return { host, path: pathname }
}

/**
 * The literal `editorConfigUrl` puts between the editor's address and the id —
 * `/?fromId=` at the time of writing, and whatever it says at the time of
 * reading. Read from the template rather than transcribed, because the slash
 * in front of the `?` is the piece a reader deletes as redundant.
 */
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

/** The path this site links the editor by, which every relative `/editor` rests on. */
function readSiteEditorPath(): string {
  return stringConstantIn(
    parseModule(LINKS, LINKS_LABEL),
    EDITOR_URL_CONSTANT,
    LINKS_LABEL
  )
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

/**
 * Every address on this site's host the page writes out, each judged against
 * the editor's. A hostname is an ADDRESS where a scheme precedes it or a path,
 * query or fragment follows it; the bare host used as a name — `the
 * agentsinc.sh store` — is neither, and is out of reach here.
 */
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

/** Whether the host found here is this host, rather than the tail of a longer one. */
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

/**
 * Every share link the page writes out, found by the query alone so that one
 * with the wrong host, the wrong path or no slash before its `?` is still
 * found and still judged. A query standing on its own — `` `?fromId=` `` as
 * the NAME of the parameter, which three reference pages write — has no
 * address in front of it to judge, and is passed over.
 */
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

/**
 * Every link whose text names this host, judged on both halves: the text
 * writes the editor's whole address, and the target is the editor.
 */
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

/** Both halves: the text writes the editor's whole address, and the target is it. */
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

/** The link text from its hostname on, which is the part claim 4 judges. */
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

/** The whole token a span falls in, so a message shows an address and not a fragment. */
function tokenAround(line: string, from: number, to: number): string {
  const tail = TOKEN_TAIL.exec(line.slice(to))?.[0] ?? ""

  return `${tokenHeadBefore(line, from)}${line.slice(from, to)}${tail}`
}

/** Whether something precedes this in the same token, which is what makes it an address. */
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
    `\n'${EDITOR_URL_CONSTANT}' in ${CONSTS_LABEL} is where the editor is, and` +
      `\n'${SHARE_LINK_FUNCTION}' beside it is the shape of a share link. The` +
      `\napex serves the landing page, so a reference that drops the path still` +
      `\nrenders — nothing but this will tell you it is wrong.`
  )
  process.exit(1)
}

/** Every way of judging nothing, said out loud. A quiet empty read is the defect, not a pass. */
function refuse(reason: string): never {
  throw new Error(`editor address: ${reason}`)
}

main()
