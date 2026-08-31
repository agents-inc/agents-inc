/**
 * The one thing this site could not previously see about itself: that clicking
 * a link makes it re-fetch its own fonts.
 *
 * WHY THIS EXISTS. Every navigation on this site is a full document load —
 * `prefetch: false` in astro.config.ts and no client router, both deliberate —
 * so every page re-resolves the whole font stack from scratch. That is fine
 * when the files are in the browser's cache and free to apply. It was not:
 * Cloudflare's static-asset server sends `cache-control: public, max-age=0,
 * must-revalidate` on EVERYTHING, content-hashed `/_astro/*` files included, so
 * a browser had to ask about all three of this site's webfonts on every click
 * before it was allowed to paint a single word in them. Until the answer came
 * back, `font-display: swap` painted the fallback — and the fallback is 25%
 * narrower than IBM Plex Mono, which this design puts on the header nav, the
 * buttons, the labels and every code block. The whole page reflowed, once per
 * link, and every gate in this repository was green throughout.
 *
 * Nothing else here can see it. `astro check` reads types; `astro build` reads
 * whether the thing compiles; a `_headers` file that does not exist is not a
 * syntax error anywhere. The defect only exists once a browser has been asked
 * to navigate twice, so a browser is what has to look.
 *
 * WHAT IT CHECKS, both stated as claims about the product rather than about the
 * configuration that currently satisfies them:
 *
 *   1. A SECOND VISIT DOWNLOADS NO FONT. This is the reported bug written down.
 *      It is measured through a server that applies `public/_headers`, so the
 *      assertion is about what Cloudflare will send rather than about what a
 *      convenient test server would have sent on its own — a static server with
 *      no opinion caches nothing, and would fail this for a reason production
 *      does not have.
 *
 *   2. A FONT NEEDED AT FIRST PAINT IS PRELOADED. Caching only helps a reader
 *      who has already been somewhere. The first page anybody opens is still a
 *      cold one, and a font referenced from inside a 65 KB stylesheet is not
 *      discovered until that stylesheet has downloaded and parsed. This asserts
 *      the discovery is declared in the HTML instead, and it is derived rather
 *      than listed: whatever a page actually asks for is what it must preload,
 *      so a fourth font added later joins this check by being used.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK. Not the flash itself — a screenshot diff
 * of a repaint is a timing test, and a timing test on a build machine measures
 * the build machine. Both claims above are discrete and survive a slow runner.
 *
 * Run against `dist/`, so it needs `astro build` first — apps/www/turbo.json
 * says so.
 */

import { createServer } from "node:http"
import type { Server } from "node:http"
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import type { Page } from "playwright"

const DIST = fileURLToPath(new URL("../dist/", import.meta.url))

/** Any free port; the browser is the only client and it is told which. */
const PORT = 4320

/**
 * One page from each half of the site, and the pair is the point rather than
 * the coverage: the landing page is hand-built `.astro` and the documentation
 * is Starlight's own layout, so they have separate heads and a preload added to
 * one of them is not added to the other. The navigation runs between the two
 * documentation pages, because that is the click the bug was reported against.
 */
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

/**
 * Every font a page requests, checked against the preloads that page declares.
 *
 * Derived from the request log rather than from a list here, so this cannot
 * drift from what the site actually loads: the subset a page needs is decided
 * by `unicode-range` against the glyphs on it, and hard-coding that decision
 * here would be a second copy of it.
 */
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
 * The reported bug: click a link, and the fonts come down again.
 *
 * The first visit is what fills the cache, so it is setup rather than
 * assertion; only the second one is measured.
 *
 * MEASURED FROM INSIDE THE PAGE, and that is not a stylistic preference — it is
 * the difference between this check working and this check lying. Playwright
 * reports a `request` event for a font served out of the browser's own cache
 * exactly as it does for one fetched over the wire, so a listener counting
 * requests calls a fixed site broken; it was written that way first and passed
 * judgement on a page that had already stopped touching the network. The
 * Resource Timing API distinguishes them: a `transferSize` of zero against a
 * non-zero `encodedBodySize` is a cache hit, because nothing crossed the
 * connection to produce a body that exists. Same-origin, so the sizes are not
 * masked the way a cross-origin entry's would be.
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
 * `public/_headers`, parsed the way Cloudflare parses it: a line at column zero
 * is a path pattern, and the indented lines under it are headers to apply.
 *
 * A missing file is not an error here. It is the state this check was written
 * against, and it fails through the assertions above — which say what the
 * reader will experience — rather than through a message about a file.
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
 * A static server that answers the way the deployed Worker answers.
 *
 * Two halves, and the second is why this is not the server in
 * check-type-scale.ts. Cloudflare sends `cache-control: public, max-age=0,
 * must-revalidate` on every asset it has not been told otherwise about, and
 * sends an ETag with it — so a server that sent nothing would fail the
 * navigation claim for a reason production does not have, and a server that
 * cached everything would pass it for one production does not have either.
 * `public/_headers` is then applied on top, exactly as Cloudflare applies it.
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
