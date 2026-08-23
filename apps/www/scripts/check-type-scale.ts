/**
 * The one thing this site could not previously see about itself: what size its
 * own text renders at.
 *
 * WHY THIS EXISTS. The landing page's section headings rendered at 9.9px —
 * smaller than the 12.1px paragraphs beneath them — while the same `h2` in the
 * documentation rendered at 38.5px, and every gate in this repository was
 * green the whole time. Nothing here reads computed style: `astro check` reads
 * types, `eslint` reads syntax, `astro build` reads whether the thing compiles.
 * A class name is a string, and `text-9` on an `<h2>` is a perfectly valid
 * string. The defect only exists once a browser has resolved a token through a
 * root font-size, so a browser is what has to look.
 *
 * WHAT IT CHECKS, both invariants stated as claims about the product rather
 * than about the CSS:
 *
 *   1. A HEADING IS LARGER THAN THE TEXT IT HEADS. This is the 9.9px defect
 *      written down. It holds per page, so it catches a new section that
 *      reaches for a label size the way the old ones did.
 *
 *   2. `/` AND `/docs` SET THE SAME ROLE AT THE SAME SIZE. This is "the two
 *      halves read as one product" turned into something falsifiable. It is
 *      the invariant the shared prose tokens in src/styles/site.css exist to
 *      guarantee, and this asserts the guarantee rather than trusting it —
 *      the tokens can be bypassed by anyone typing a literal size.
 *
 * Both failed on the build immediately before the tokens landed, which is the
 * only evidence that either of them tests anything.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK. Not colour, not contrast, and not
 * spacing. Contrast especially: todo/www.md records under "Constraints already
 * settled" that WCAG AA is deliberately not met on this site (owner ruling,
 * 2026-08-07), so a contrast assertion here would fail on purpose and be
 * switched off within the week. Structural a11y is packages/ui's Storybook axe
 * gate's job and stays there.
 *
 * Run against `dist/`, so it needs `astro build` first — apps/www/turbo.json
 * says so.
 */

import { createServer } from "node:http"
import type { Server } from "node:http"
import { createReadStream, existsSync, statSync } from "node:fs"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import type { Page } from "playwright"

const DIST = fileURLToPath(new URL("../dist/", import.meta.url))

/** Any free port; the browser is the only client and it is told which. */
const PORT = 4319

/**
 * The two pages that carry the site's whole type range between them, plus the
 * not-found page, which was a third visual identity until 2026-08-21 and is
 * the one most likely to drift again because nobody looks at it.
 */
const PAGES = ["/", "/docs/why/", "/docs/quickstart/", "/404.html"]

/** The three roles both halves must agree on, and where each one is found. */
const SHARED_ROLES = [
  { role: "page title", landing: "h1#headline", docs: "h1" },
  {
    role: "section heading",
    landing: "h2#the-approach",
    docs: ".sl-markdown-content h2",
  },
  {
    role: "body copy",
    landing: "#the-approach + p",
    docs: ".sl-markdown-content p",
  },
] as const

/** Every heading inside the article, on either half. */
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

/**
 * Every heading on every page, paired with the first block of running text
 * beneath it. A heading with nothing after it is skipped rather than failed —
 * a trailing heading is a content decision, not a type defect.
 */
async function headingsSmallerThanTheirBody(page: Page): Promise<Failure[]> {
  const failures: Failure[] = []

  for (const path of PAGES) {
    await visit(page, path)
    const inversions = await page.evaluate(
      ({ selector, runningText }) => {
        const sizeOf = (element: Element) =>
          parseFloat(getComputedStyle(element).fontSize)

        // Starlight wraps each heading in a `.sl-heading-wrapper`, so the
        // paragraph after it is the wrapper's sibling rather than the
        // heading's. Climbing while there is no sibling handles both that
        // shape and the landing page's plain one, with no special case for
        // either half.
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

/**
 * The same three roles, measured on the landing page and again in the
 * documentation. They resolve to one set of tokens in src/styles/site.css, so
 * any disagreement means somebody wrote a size instead of a role.
 */
async function rolesTheTwoHalvesDisagreeOn(page: Page): Promise<Failure[]> {
  const failures: Failure[] = []

  for (const { role, landing, docs } of SHARED_ROLES) {
    await visit(page, "/")
    const landingPx = await fontSizeOf(page, landing)
    await visit(page, "/docs/why/")
    const docsPx = await fontSizeOf(page, docs)

    if (landingPx === null)
      failures.push(`landing page has no ${role} matching \`${landing}\`.`)
    if (docsPx === null)
      failures.push(`documentation has no ${role} matching \`${docs}\`.`)
    if (landingPx === null || docsPx === null) continue

    if (landingPx !== docsPx) {
      failures.push(
        `${role} is ${landingPx}px on / and ${docsPx}px on /docs — ` +
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

/**
 * A static server rather than `file://`, because every asset the built pages
 * reference is an absolute path and `file://` resolves those against the
 * filesystem root — the pages load, unstyled, and every assertion passes on a
 * page with no CSS.
 */
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
