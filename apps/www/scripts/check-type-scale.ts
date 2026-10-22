/**
 * Browser-measured type invariants: a heading is larger than the text it
 * heads, and the 404 and `/docs` set each shared role at the same size. Not colour,
 * contrast or spacing. Reads `dist/`, so needs `astro build`.
 */

import { createServer } from "node:http"
import type { Server } from "node:http"
import { createReadStream, existsSync, statSync } from "node:fs"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import type { Page } from "playwright"

const DIST = fileURLToPath(new URL("../dist/", import.meta.url))

const PORT = 4319

const PAGES = ["/docs/why/", "/docs/quickstart/", "/404.html"]

// The one page not built by Starlight.
const NOT_FOUND = "/404.html"

const SHARED_ROLES = [
  { role: "page title", notFound: "main h1", docs: "h1" },
  {
    role: "body copy",
    notFound: "main h1 + p",
    docs: ".sl-markdown-content p",
  },
] as const

const HEADINGS_IN_CONTENT = "main :is(h1, h2, h3, h4)"

/** What counts as "the text it heads". */
const RUNNING_TEXT = ["P", "UL", "OL"]

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
}

type Failure = string

async function main(): Promise<void> {
  if (!existsSync(DIST)) {
    exitWith([`dist/ not found at ${DIST} — run \`astro build\` first.`])
  }

  const server = await serveDist()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  const failures = [
    ...(await headingsSmallerThanTheirBody(page)),
    ...(await rolesTheTwoHalvesDisagreeOn(page)),
  ]

  await browser.close()
  server.close()

  exitWith(failures)
}

/** A heading with nothing after it is skipped: a trailing heading is not a type defect. */
async function headingsSmallerThanTheirBody(page: Page): Promise<Failure[]> {
  const failures: Failure[] = []

  for (const path of PAGES) {
    await visit(page, path)
    const inversions = await page.evaluate(
      ({ selector, runningText }) => {
        const sizeOf = (element: Element) =>
          parseFloat(getComputedStyle(element).fontSize)

        // Climb past Starlight's `.sl-heading-wrapper` to the following text.
        const textAfter = (heading: Element): Element | null => {
          let node: Element | null = heading
          while (node !== null && node.nextElementSibling === null)
            node = node.parentElement
          let next = node === null ? null : node.nextElementSibling
          while (next !== null && !runningText.includes(next.tagName)) {
            next = next.nextElementSibling
          }
          return next
        }

        const found = []
        for (const heading of document.querySelectorAll(selector)) {
          const body = textAfter(heading)
          if (body === null) continue

          const headingPx = sizeOf(heading)
          const bodyPx = sizeOf(body)
          if (headingPx > bodyPx) continue

          found.push({
            tag: heading.tagName,
            text: heading.textContent.trim().slice(0, 40),
            headingPx,
            bodyPx,
          })
        }
        return found
      },
      { selector: HEADINGS_IN_CONTENT, runningText: RUNNING_TEXT }
    )

    for (const found of inversions) {
      failures.push(
        `${path} — ${found.tag} "${found.text}" renders at ${found.headingPx}px, ` +
          `not larger than the ${found.bodyPx}px text it heads.`
      )
    }
  }

  return failures
}

async function rolesTheTwoHalvesDisagreeOn(page: Page): Promise<Failure[]> {
  const failures: Failure[] = []

  for (const { role, notFound, docs } of SHARED_ROLES) {
    await visit(page, NOT_FOUND)
    const notFoundPx = await fontSizeOf(page, notFound)
    await visit(page, "/docs/why/")
    const docsPx = await fontSizeOf(page, docs)

    if (notFoundPx === null)
      failures.push(`${NOT_FOUND} has no ${role} matching \`${notFound}\`.`)
    if (docsPx === null)
      failures.push(`documentation has no ${role} matching \`${docs}\`.`)
    if (notFoundPx === null || docsPx === null) continue

    if (notFoundPx !== docsPx) {
      failures.push(
        `${role} is ${notFoundPx}px on ${NOT_FOUND} and ${docsPx}px on /docs — ` +
          `the two halves are setting one role at two sizes.`
      )
    }
  }

  return failures
}

async function fontSizeOf(
  page: Page,
  selector: string
): Promise<number | null> {
  return page.evaluate((s) => {
    const el = document.querySelector(s)
    return el ? parseFloat(getComputedStyle(el).fontSize) : null
  }, selector)
}

async function visit(page: Page, path: string): Promise<void> {
  await page.goto(`http://localhost:${PORT}${path}`, {
    waitUntil: "networkidle",
  })
}

/** Not `file://`: absolute asset paths would resolve against the filesystem root, unstyled. */
function serveDist(): Promise<Server> {
  const server = createServer((request, response) => {
    const path = normalize(decodeURI((request.url ?? "/").split("?")[0]!))
    const candidate = join(DIST, path)
    const file =
      existsSync(candidate) && statSync(candidate).isDirectory()
        ? join(candidate, "index.html")
        : candidate

    if (!existsSync(file)) {
      response.writeHead(404).end()
      return
    }

    response.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
    })
    createReadStream(file).pipe(response)
  })

  return new Promise((resolve) => server.listen(PORT, () => resolve(server)))
}

function exitWith(failures: Failure[]): never {
  if (failures.length === 0) {
    console.log(
      `type scale: ${PAGES.length} pages, ${SHARED_ROLES.length} shared roles, all agree`
    )
    process.exit(0)
  }

  console.error(`type scale: ${failures.length} failure(s)\n`)
  for (const failure of failures) console.error(`  · ${failure}`)
  console.error(
    "\nThe site's prose sizes are defined once, in src/styles/site.css."
  )
  process.exit(1)
}

await main()
