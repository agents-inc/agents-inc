/**
 * Holds the docs search to the pages a reader searches for: no page of the
 * Releases section is in Pagefind's index, and every other page the site
 * builds is, the not-found page excepted. Read twice: from the index files
 * under dist/pagefind/, and through Pagefind's own search in a browser over
 * the built site, for terms the release notes mention often. Reads dist/, so
 * needs `astro build`. A broken read refuses.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import type { Server } from "node:http"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"
import { chromium } from "playwright"
import type { Page } from "playwright"

import { reportChecks } from "./check-report"
import type { Check } from "./check-report"
import { createDistServer, DIST, htmlFilesUnder } from "./dist-server"

const PAGEFIND_DIR = "pagefind/"

const ENTRY_FILE = `${PAGEFIND_DIR}pagefind-entry.json`

const FRAGMENT_DIR = `${PAGEFIND_DIR}fragment/`

// What the search box loads, at Starlight's bundle path for a site with no base.
const PAGEFIND_BUNDLE = `/${PAGEFIND_DIR}pagefind.js`

// An unzipped fragment opens with this, then its JSON.
const FRAGMENT_SIGNATURE = "pagefind_dcd"

const PAGE_COUNT = /"page_count":\s*(\d+)/g

const RELEASES_PATH = "/docs/releases/"

const NOT_FOUND_PAGE = "/404.html"

const SEARCH_FROM = "/docs/"

const SEARCHES = [
  { term: "uninstall", finds: "/docs/reference/commands/" },
  { term: "doctor", finds: "/docs/troubleshooting/" },
  { term: "edit --from", finds: "/docs/guides/editing-config/" },
] as const

type Search = { term: string; finds: string; urls: string[] }

type PagefindBundle = {
  search(term: string): Promise<{
    results: { data(): Promise<{ url: string }> }[]
  }>
}

async function main(): Promise<never> {
  const indexed = readIndex()
  const built = readBuiltPages()
  const searches = await searchTheBuiltSite()

  return reportChecks(
    "search index",
    [
      noReleasePageIsIndexed(indexed, built),
      everyOtherPageIsIndexed(indexed, built),
      noSearchFindsAReleasePage(searches),
      everySearchFindsItsPage(searches),
    ],
    "A Starlight page leaves the\nindex when its data sets `pagefind: false`, which drops the indexing marker from its <main>."
  )
}

function noReleasePageIsIndexed(indexed: string[], built: string[]): Check {
  const holds = `no page under ${RELEASES_PATH} is in the search index`
  if (!built.some(isReleasePage)) {
    return {
      holds,
      offences: [
        `no page under ${RELEASES_PATH} was built, so the exclusion was tested on nothing`,
      ],
    }
  }

  return {
    holds,
    offences: indexed.filter(isReleasePage).map((url) => `${url} is indexed`),
  }
}

function everyOtherPageIsIndexed(indexed: string[], built: string[]): Check {
  const inIndex = new Set(indexed)
  return {
    holds: `every page built outside ${RELEASES_PATH} is in the search index, ${NOT_FOUND_PAGE} excepted`,
    offences: built
      .filter((path) => !isReleasePage(path) && path !== NOT_FOUND_PAGE)
      .filter((path) => !inIndex.has(path))
      .map((path) => `${path} was built and is not indexed`),
  }
}

function noSearchFindsAReleasePage(searches: Search[]): Check {
  return {
    holds: `no search finds a page under ${RELEASES_PATH}: ${searches.map(({ term }) => `"${term}"`).join(", ")}`,
    offences: searches.flatMap(({ term, urls }) => {
      const releases = urls.filter(isReleasePage)
      return releases.length === 0
        ? []
        : [
            `"${term}" finds ${releases.length} release page(s) among ${urls.length} results, ${releases[0] ?? ""} among them`,
          ]
    }),
  }
}

function everySearchFindsItsPage(searches: Search[]): Check {
  return {
    holds: `each search still finds the page it is for: ${searches.map(({ term, finds }) => `"${term}" ${finds}`).join(", ")}`,
    offences: searches
      .filter(({ finds, urls }) => !urls.includes(finds))
      .map(
        ({ term, finds, urls }) =>
          `"${term}" does not find ${finds}; it finds ${urls.length} other page(s)`
      ),
  }
}

function readIndex(): string[] {
  if (!existsSync(DIST))
    refuse(`dist/ not found at ${DIST} — run \`astro build\` first`)
  const entryFile = join(DIST, ENTRY_FILE)
  const fragmentDir = join(DIST, FRAGMENT_DIR)
  if (!existsSync(entryFile) || !existsSync(fragmentDir)) {
    refuse(
      `dist/${ENTRY_FILE} or dist/${FRAGMENT_DIR} not found, so the site was built with no search index`
    )
  }

  const counts = [...readFileSync(entryFile, "utf8").matchAll(PAGE_COUNT)]
  if (counts.length === 0) {
    refuse(
      `dist/${ENTRY_FILE} names no page count, so the search box loads no index; rebuild`
    )
  }
  const pageCount = counts.reduce((sum, [, count]) => sum + Number(count), 0)
  const urls = readdirSync(fragmentDir).map(urlOfFragment)
  if (urls.length !== pageCount) {
    refuse(
      `dist/${ENTRY_FILE} counts ${pageCount} indexed pages and dist/${FRAGMENT_DIR} holds ${urls.length}, so this read is not reading the index`
    )
  }

  console.log(
    `search index: control: dist/${FRAGMENT_DIR} read, ${urls.length} pages, the count dist/${ENTRY_FILE} gives`
  )
  return urls
}

function urlOfFragment(file: string): string {
  const text = gunzipSync(
    readFileSync(join(DIST, FRAGMENT_DIR, file))
  ).toString("utf8")
  if (!text.startsWith(FRAGMENT_SIGNATURE)) {
    refuse(
      `dist/${FRAGMENT_DIR}${file} does not open with "${FRAGMENT_SIGNATURE}"; Pagefind's format has changed`
    )
  }

  const fragment: unknown = JSON.parse(text.slice(FRAGMENT_SIGNATURE.length))
  if (
    typeof fragment !== "object" ||
    fragment === null ||
    !("url" in fragment) ||
    typeof fragment.url !== "string"
  ) {
    refuse(`dist/${FRAGMENT_DIR}${file} records no page url`)
  }
  return fragment.url
}

function readBuiltPages(): string[] {
  const pages = htmlFilesUnder(DIST)
    .filter((file) => !file.startsWith(PAGEFIND_DIR))
    .map((file) => `/${file.replace(/(^|\/)index\.html$/, "$1")}`)
  if (pages.length === 0) refuse(`dist/ holds no page`)
  return pages
}

async function searchTheBuiltSite(): Promise<Search[]> {
  const { server, origin } = await serveDist()
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${origin}${SEARCH_FROM}`, { waitUntil: "networkidle" })
    const searches: Search[] = []
    for (const { term, finds } of SEARCHES) {
      const urls = await search(page, term)
      console.log(
        `search index: control: "${term}" on ${SEARCH_FROM} finds ${urls.length} page(s)`
      )
      searches.push({ term, finds, urls })
    }
    return searches
  } finally {
    await browser.close()
    server.close()
  }
}

/** Every result, not only those the box loads at once. */
function search(page: Page, term: string): Promise<string[]> {
  return page.evaluate(
    async ({ bundle, term }) => {
      const pagefind = (await import(bundle)) as PagefindBundle
      const { results } = await pagefind.search(term)
      return Promise.all(
        results.map(async (result) => (await result.data()).url)
      )
    },
    { bundle: PAGEFIND_BUNDLE, term }
  )
}

/** Not `file://`: the bundle fetches its index by absolute path. */
async function serveDist(): Promise<{ server: Server; origin: string }> {
  const server = createDistServer()
  // Port 0, so a second run beside this one cannot collide.
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  )
  const address = server.address()
  if (address === null || typeof address === "string") {
    server.close()
    refuse("the static server for dist/ reports no port")
  }
  return { server, origin: `http://127.0.0.1:${address.port}` }
}

function isReleasePage(path: string): boolean {
  return path.startsWith(RELEASES_PATH)
}

function refuse(reason: string): never {
  throw new Error(`search index: ${reason}`)
}

await main()
