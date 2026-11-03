/**
 * Holds that the apex is the editor: the build ships no page at `/`, its
 * `_redirects` sends `/` to the site's `EDITOR_URL` permanently, and no built
 * page links to `/`, which is only a redirect. Rules are parsed as
 * Cloudflare's asset router reads them. Reads `dist/`, so needs `astro build`.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { EDITOR_URL } from "../src/lib/links"
import { reportFailures } from "./check-report"
import { DIST, htmlFilesUnder } from "./dist-server"
import { isNonNull } from "./is-non-null"

const REDIRECTS_LABEL = "dist/_redirects"

const ROOT_PATH = "/"

const MOVED_PERMANENTLY = "301"

// Without a code Cloudflare answers 302, which a browser does not remember.
const CLOUDFLARE_DEFAULT_STATUS = "302"

const LINK_TO_ROOT = /href=["']\/["']/

const RULE_FIELD_SEPARATOR = /\s+/

const COMMENT_PREFIX = "#"

type Failure = string

type Rule = { from: string; to: string; status: string }

function main(): never {
  if (!existsSync(DIST))
    refuse(`dist/ not found at ${DIST} — run \`astro build\` first`)

  const pages = htmlFilesUnder(DIST)
  if (pages.length === 0) refuse("dist/ holds no HTML page")

  return exitWith([
    ...noPageAtTheApex(),
    ...theApexRedirectsToTheEditor(readRules()),
    ...pagesLinkingToTheApex(pages),
  ])
}

function noPageAtTheApex(): Failure[] {
  return existsSync(join(DIST, "index.html"))
    ? ["dist/index.html exists, so the build still ships a page at /."]
    : []
}

function theApexRedirectsToTheEditor(rules: Rule[]): Failure[] {
  const apex = rules.find((rule) => rule.from === ROOT_PATH)
  if (apex === undefined)
    return [`${REDIRECTS_LABEL} has no rule for ${ROOT_PATH}.`]

  return [wrongDestination(apex), wrongStatus(apex)].filter(isNonNull)
}

function wrongDestination(apex: Rule): Failure | null {
  return apex.to === EDITOR_URL
    ? null
    : `${REDIRECTS_LABEL} sends ${ROOT_PATH} to ${apex.to}, not to EDITOR_URL (${EDITOR_URL}).`
}

function wrongStatus(apex: Rule): Failure | null {
  return apex.status === MOVED_PERMANENTLY
    ? null
    : `${REDIRECTS_LABEL} answers ${ROOT_PATH} with ${apex.status}, not ${MOVED_PERMANENTLY}.`
}

function pagesLinkingToTheApex(pages: string[]): Failure[] {
  return pages
    .filter(linksToTheApex)
    .map(
      (page) =>
        `dist/${page} links to ${ROOT_PATH} rather than to where it redirects.`
    )
}

function linksToTheApex(page: string): boolean {
  return LINK_TO_ROOT.test(readFileSync(join(DIST, page), "utf8"))
}

function readRules(): Rule[] {
  const source = join(DIST, "_redirects")
  if (!existsSync(source)) return []

  return readFileSync(source, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(isRuleLine)
    .map(ruleOf)
}

function isRuleLine(line: string): boolean {
  return line !== "" && !line.startsWith(COMMENT_PREFIX)
}

/** `source destination [status]`. */
function ruleOf(line: string): Rule {
  const [from = "", to = "", status = CLOUDFLARE_DEFAULT_STATUS] =
    line.split(RULE_FIELD_SEPARATOR)

  return { from, to, status }
}

function exitWith(failures: Failure[]): never {
  return reportFailures("apex redirect", failures, {
    passed:
      `no page at ${ROOT_PATH}, ${ROOT_PATH} moves permanently to ${EDITOR_URL}, ` +
      `and none of the built pages links to ${ROOT_PATH}`,
    remedy: "The rule is declared in apps/www/public/_redirects.",
  })
}

/** An empty read is the defect, not a pass. */
function refuse(reason: string): never {
  throw new Error(`apex redirect: ${reason}`)
}

main()
