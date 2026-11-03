/**
 * Browser-measured type invariants: a heading is larger than the text it
 * heads, and the 404 and `/docs` set each shared role at the same size. Not colour,
 * contrast or spacing. Reads `dist/`, so needs `astro build`.
 */

import type { Server } from "node:http"
import { existsSync } from "node:fs"
import { chromium } from "playwright"
import type { Page } from "playwright"

import { reportFailures } from "./check-report"
import { createDistServer, DIST, listening, visit } from "./dist-server"

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

type Failure = string

type SharedRole = (typeof SHARED_ROLES)[number]

type Inversion = {
  tag: string
  text: string
  headingPx: number
  bodyPx: number
}

type RoleSizes = { notFoundPx: number | null; docsPx: number | null }

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
    await visit(page, PORT, path)
    const inversions = await headingInversionsOn(page)
    failures.push(...inversions.map((found) => describeInversion(path, found)))
  }

  return failures
}

async function rolesTheTwoHalvesDisagreeOn(page: Page): Promise<Failure[]> {
  const failures: Failure[] = []

  for (const shared of SHARED_ROLES) {
    const notFoundPx = await fontSizeAt(page, NOT_FOUND, shared.notFound)
    const docsPx = await fontSizeAt(page, "/docs/why/", shared.docs)
    failures.push(...roleFailures(shared, { notFoundPx, docsPx }))
  }

  return failures
}

function headingInversionsOn(page: Page): Promise<Inversion[]> {
  return page.evaluate(
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

      const found: Inversion[] = []
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
}

function describeInversion(path: string, found: Inversion): Failure {
  return (
    `${path} — ${found.tag} "${found.text}" renders at ${found.headingPx}px, ` +
    `not larger than the ${found.bodyPx}px text it heads.`
  )
}

function roleFailures(
  { role, notFound, docs }: SharedRole,
  { notFoundPx, docsPx }: RoleSizes
): Failure[] {
  if (notFoundPx !== null && docsPx !== null) {
    return notFoundPx === docsPx
      ? []
      : [
          `${role} is ${notFoundPx}px on ${NOT_FOUND} and ${docsPx}px on /docs — ` +
            `the two halves are setting one role at two sizes.`,
        ]
  }

  return [
    ...(notFoundPx === null
      ? [`${NOT_FOUND} has no ${role} matching \`${notFound}\`.`]
      : []),
    ...(docsPx === null
      ? [`documentation has no ${role} matching \`${docs}\`.`]
      : []),
  ]
}

async function fontSizeAt(
  page: Page,
  path: string,
  selector: string
): Promise<number | null> {
  await visit(page, PORT, path)
  return page.evaluate((s) => {
    const el = document.querySelector(s)
    return el ? parseFloat(getComputedStyle(el).fontSize) : null
  }, selector)
}

/** Not `file://`: absolute asset paths would resolve against the filesystem root, unstyled. */
function serveDist(): Promise<Server> {
  return listening(createDistServer(), PORT)
}

function exitWith(failures: Failure[]): never {
  return reportFailures("type scale", failures, {
    passed: `${PAGES.length} pages, ${SHARED_ROLES.length} shared roles, all agree`,
    remedy: "The site's prose sizes are defined once, in src/styles/site.css.",
  })
}

await main()
