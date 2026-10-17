/**
 * Holds that a second page visit downloads no font (served with Cloudflare's
 * default caching plus `public/_headers`), and that every font a page requests
 * is preloaded. Not the flash itself: a repaint timing test measures the
 * runner. Reads `dist/`, so needs `astro build`.
 */

import { createServer } from "node:http"
import type { Server } from "node:http"
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import type { Page } from "playwright"

const DIST = fileURLToPath(new URL("../dist/", import.meta.url))

const PORT = 4320

// One page per half, since each has its own head.
const COLD_PAGES = ["/", "/docs/quickstart/"]
const NAVIGATE_FROM = "/docs/quickstart/"
const NAVIGATE_TO = "/docs/why/"

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
}

const IS_FONT = /\.woff2?($|\?)/

type Failure = string
type HeaderRule = { pattern: RegExp; headers: [string, string][] }

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
    const requested: string[] = []
    const collect = (url: string) => {
      if (IS_FONT.test(url)) requested.push(fileOf(url))
    }
    const listener = (request: { url(): string }) => collect(request.url())
    page.on("request", listener)

    await page.context().clearCookies()
    await visit(page, path)
    await page.evaluate(() => document.fonts.ready)
    page.off("request", listener)

    const preloaded = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLLinkElement>(
          'link[rel="preload"][as="font"]'
        ),
      ].map((link) => link.href.split("/").pop() ?? "")
    )

    if (requested.length === 0) {
      failures.push(
        `${path} requested no webfont at all — the check cannot tell whether ` +
          `the preloads are right, and this page should be using Inter.`
      )
      continue
    }

    for (const file of new Set(requested)) {
      if (preloaded.includes(file)) continue
      failures.push(
        `${path} downloads ${file} but does not preload it — the browser ` +
          `cannot discover it until site.css has parsed.`
      )
    }
  }

  return failures
}

/**
 * Measured with Resource Timing, not request events: Playwright reports cache
 * hits as requests too. A zero `transferSize` is a cache hit.
 */
async function fontsRefetchedOnNavigation(page: Page): Promise<Failure[]> {
  await visit(page, NAVIGATE_FROM)
  await page.evaluate(() => document.fonts.ready)

  await visit(page, NAVIGATE_TO)
  await page.evaluate(() => document.fonts.ready)

  const overTheWire = await page.evaluate(() =>
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

  if (overTheWire.length === 0) return []

  return [
    `navigating ${NAVIGATE_FROM} -> ${NAVIGATE_TO} went back to the network ` +
      `for ${overTheWire.length} font file(s) already loaded on the previous ` +
      `page: ${overTheWire.map((f) => `${f.file} (${f.bytes} B)`).join(", ")}. ` +
      `Every click repaints in the fallback face until they arrive.`,
  ]
}

const fileOf = (url: string) => url.split("/").pop() ?? url

async function visit(page: Page, path: string): Promise<void> {
  await page.goto(`http://localhost:${PORT}${path}`, {
    waitUntil: "networkidle",
  })
}

/**
 * Parsed as Cloudflare does: column-zero lines are patterns, indented lines are
 * headers. A missing file fails through the assertions, not here.
 */
function headerRules(): HeaderRule[] {
  const source = fileURLToPath(new URL("../public/_headers", import.meta.url))
  if (!existsSync(source)) return []

  const rules: HeaderRule[] = []
  for (const line of readFileSync(source, "utf8").split("\n")) {
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
    const url = (request.url ?? "/").split("?")[0]!
    const path = normalize(decodeURI(url))
    const candidate = join(DIST, path)
    const file =
      existsSync(candidate) && statSync(candidate).isDirectory()
        ? join(candidate, "index.html")
        : candidate

    if (!existsSync(file)) {
      response.writeHead(404).end()
      return
    }

    const stat = statSync(file)
    const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`

    const headers: Record<string, string> = {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": "public, max-age=0, must-revalidate",
      etag,
    }
    for (const rule of rules) {
      if (!rule.pattern.test(url)) continue
      for (const [name, value] of rule.headers) {
        headers[name.toLowerCase()] = value
      }
    }

    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304, headers).end()
      return
    }

    response.writeHead(200, headers)
    createReadStream(file).pipe(response)
  })

  return new Promise((resolve) => server.listen(PORT, () => resolve(server)))
}

function exitWith(failures: Failure[]): never {
  if (failures.length === 0) {
    console.log(
      `webfont delivery: ${COLD_PAGES.length} pages preload what they use, ` +
        `and a navigation downloads no font`
    )
    process.exit(0)
  }

  console.error(`webfont delivery: ${failures.length} failure(s)\n`)
  for (const failure of failures) console.error(`  · ${failure}`)
  console.error(
    "\nCaching is declared in apps/www/public/_headers, and the preloads are " +
      "in src/components/font-preloads.astro."
  )
  process.exit(1)
}

await main()
