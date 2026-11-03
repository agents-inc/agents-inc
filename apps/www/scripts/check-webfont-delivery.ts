/**
 * Holds that a second page visit downloads no font (served with Cloudflare's
 * default caching plus `public/_headers`), and that every font a page requests
 * is preloaded. Not the flash itself: a repaint timing test measures the
 * runner. Reads `dist/`, so needs `astro build`.
 */

import { createServer } from "node:http"
import type { Server } from "node:http"
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import type { Page } from "playwright"

import { reportFailures } from "./check-report"
import {
  contentTypeOf,
  DIST,
  distFileOf,
  listening,
  requestPath,
  visit,
} from "./dist-server"

const PORT = 4320

// One page per half, since each has its own head: the 404 is not Starlight's.
const COLD_PAGES = ["/404.html", "/docs/quickstart/"]
const NAVIGATE_FROM = "/docs/quickstart/"
const NAVIGATE_TO = "/docs/why/"

const IS_FONT = /\.woff2?($|\?)/

type Failure = string
type HeaderRule = { pattern: RegExp; headers: [string, string][] }
type FontTransfer = { file: string; bytes: number }

async function main(): Promise<void> {
  if (!existsSync(DIST)) {
    exitWith([`dist/ not found at ${DIST} — run \`astro build\` first.`])
  }

  const server = await serveDist(headerRules())
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()

  const failures = [
    ...(await fontsPreloadedWherePagesUseThem(page)),
    ...(await fontsRefetchedOnNavigation(page)),
  ]

  await browser.close()
  server.close()

  exitWith(failures)
}

/** Derived from the request log, so a newly used font joins the check. */
async function fontsPreloadedWherePagesUseThem(page: Page): Promise<Failure[]> {
  const failures: Failure[] = []

  for (const path of COLD_PAGES) {
    const requested = await fontsRequestedOnColdVisit(page, path)
    const preloaded = await fontsPreloadedOn(page)
    failures.push(...preloadFailures(path, requested, preloaded))
  }

  return failures
}

async function fontsRefetchedOnNavigation(page: Page): Promise<Failure[]> {
  await visitUntilFontsLoad(page, NAVIGATE_FROM)
  await visitUntilFontsLoad(page, NAVIGATE_TO)

  return refetchFailures(await fontsFetchedOverTheWire(page))
}

/**
 * Measured with Resource Timing, not request events: Playwright reports cache
 * hits as requests too. A zero `transferSize` is a cache hit.
 */
function fontsFetchedOverTheWire(page: Page): Promise<FontTransfer[]> {
  return page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter(
        (entry): entry is PerformanceResourceTiming => "transferSize" in entry
      )
      .filter((entry) => /\.woff2?($|\?)/.test(entry.name))
      .filter((entry) => entry.transferSize > 0)
      .map((entry) => ({
        file: entry.name.split("/").pop() ?? entry.name,
        bytes: entry.transferSize,
      }))
  )
}

async function fontsRequestedOnColdVisit(
  page: Page,
  path: string
): Promise<string[]> {
  const requested: string[] = []
  const listener = (request: { url(): string }) => {
    const url = request.url()
    if (IS_FONT.test(url)) requested.push(fileOf(url))
  }

  page.on("request", listener)
  await page.context().clearCookies()
  await visitUntilFontsLoad(page, path)
  page.off("request", listener)

  return requested
}

function fontsPreloadedOn(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLLinkElement>(
        'link[rel="preload"][as="font"]'
      ),
    ].map((link) => link.href.split("/").pop() ?? "")
  )
}

function preloadFailures(
  path: string,
  requested: string[],
  preloaded: string[]
): Failure[] {
  if (requested.length === 0) {
    return [
      `${path} requested no webfont at all — the check cannot tell whether ` +
        `the preloads are right, and this page should be using Inter.`,
    ]
  }

  return [...new Set(requested)]
    .filter((file) => !preloaded.includes(file))
    .map(
      (file) =>
        `${path} downloads ${file} but does not preload it — the browser ` +
        `cannot discover it until site.css has parsed.`
    )
}

function refetchFailures(overTheWire: FontTransfer[]): Failure[] {
  if (overTheWire.length === 0) return []

  return [
    `navigating ${NAVIGATE_FROM} -> ${NAVIGATE_TO} went back to the network ` +
      `for ${overTheWire.length} font file(s) already loaded on the previous ` +
      `page: ${overTheWire.map((f) => `${f.file} (${f.bytes} B)`).join(", ")}. ` +
      `Every click repaints in the fallback face until they arrive.`,
  ]
}

const fileOf = (url: string) => url.split("/").pop() ?? url

async function visitUntilFontsLoad(page: Page, path: string): Promise<void> {
  await visit(page, PORT, path)
  await page.evaluate(() => document.fonts.ready)
}

/**
 * Parsed as Cloudflare does: column-zero lines are patterns, indented lines are
 * headers. A missing file fails through the assertions, not here.
 */
function headerRules(): HeaderRule[] {
  const source = fileURLToPath(new URL("../public/_headers", import.meta.url))
  return existsSync(source)
    ? parseHeaderRules(readFileSync(source, "utf8"))
    : []
}

function parseHeaderRules(source: string): HeaderRule[] {
  const rules: HeaderRule[] = []
  for (const line of source.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue

    if (!/^\s/.test(line)) {
      rules.push({ pattern: patternOf(line.trim()), headers: [] })
      continue
    }

    const [name, ...rest] = line.trim().split(":")
    if (name === undefined || rest.length === 0) continue
    rules.at(-1)?.headers.push([name.trim(), rest.join(":").trim()])
  }

  return rules
}

/** Cloudflare's `*` is "any run of characters", including `/`. */
const patternOf = (path: string) =>
  new RegExp(
    `^${path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`
  )

/**
 * Answers as the deployed Worker does: Cloudflare's revalidating default plus
 * an ETag, with `public/_headers` applied on top.
 */
function serveDist(rules: HeaderRule[]): Promise<Server> {
  const server = createServer((request, response) => {
    const url = requestPath(request)
    const file = distFileOf(url)
    if (file === null) {
      response.writeHead(404).end()
      return
    }

    const etag = etagOf(file)
    const headers = responseHeadersFor(url, file, etag, rules)
    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304, headers).end()
      return
    }

    response.writeHead(200, headers)
    createReadStream(file).pipe(response)
  })

  return listening(server, PORT)
}

function etagOf(file: string): string {
  const stat = statSync(file)
  return `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`
}

/** Later rules override earlier ones, header by header. */
function responseHeadersFor(
  url: string,
  file: string,
  etag: string,
  rules: HeaderRule[]
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": contentTypeOf(file),
    "cache-control": "public, max-age=0, must-revalidate",
    etag,
  }
  for (const rule of rules.filter((rule) => rule.pattern.test(url))) {
    for (const [name, value] of rule.headers) {
      headers[name.toLowerCase()] = value
    }
  }
  return headers
}

function exitWith(failures: Failure[]): never {
  return reportFailures("webfont delivery", failures, {
    passed:
      `${COLD_PAGES.length} pages preload what they use, ` +
      `and a navigation downloads no font`,
    remedy:
      "Caching is declared in apps/www/public/_headers, and the preloads are " +
      "in src/components/font-preloads.astro.",
  })
}

await main()
