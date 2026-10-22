import { CATALOG } from "@workspace/matrix"

import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"
import { stubCompose, stubSignedIn } from "../support/auth"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  MULTI_CATEGORY,
  STACKS,
} from "../support/catalog"

/**
 * A change to the selection that switches a sub-agent on or off says so in a
 * toast, and why. A sub-agent a stack declares stays on without skills.
 */

const { web } = DOMAINS
const { name: FRAMEWORK, first: REACT } = EXCLUSIVE_CATEGORY
const { name: STYLING, first: TAILWIND } = MULTI_CATEGORY

// Copy the product renders, mirrored rather than imported.
const REACT_ON =
  "web developer, web researcher, web tester and 2 more switched on: React added"
const TESTER_OFF_TAILWIND = "web tester switched off: Tailwind CSS removed"
const TESTER_OFF_REACT = "web tester switched off: React removed"
const BATCH_ON =
  "web developer, web researcher, web tester and 2 more switched on: React and Tailwind CSS added"

const TESTER = "web-tester"
const SENTENCE = "A React app styled with Tailwind."

// Inside a toast's 5 s life: a longer wait for none passes once a wrongly
// raised toast expires.
const BEFORE_A_TOAST_EXPIRES = { timeout: 2_000 }

const skillIdNamed = (displayName: string) =>
  Object.values(CATALOG.skillsById).find(
    (skill) => skill.displayName === displayName
  )!.id

test.describe("the toast a change to the selection raises", () => {
  test("names the sub-agents a picked skill switched on", async ({
    configure,
  }) => {
    await configure.skillIn(web, FRAMEWORK, REACT).toggle()

    await expect(configure.toasts.named(REACT_ON)).toBeVisible()
  })

  test("names a sub-agent whose last skill was taken off it, and why", async ({
    configure,
  }) => {
    await configure.skillIn(web, STYLING, TAILWIND).toggle()

    await configure.roster.skillRow(TAILWIND, TESTER).click()

    await expect(configure.toasts.named(TESTER_OFF_TAILWIND)).toBeVisible()
    await expect(configure.roster.agentButton("web", "tester")).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  test("raises nothing when the roster switches the sub-agent's row back on", async ({
    configure,
  }) => {
    await configure.skillIn(web, STYLING, TAILWIND).toggle()
    await configure.roster.skillRow(TAILWIND, TESTER).click()
    await expect(configure.toasts.named(TESTER_OFF_TAILWIND)).toBeVisible()

    await configure.roster.skillRow(TAILWIND, TESTER).click()

    await expect(configure.roster.agentButton("web", "tester")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    // A toast raised here would replace this one.
    await expect(configure.toasts.all).toHaveCount(1)
    await expect(configure.toasts.named(TESTER_OFF_TAILWIND)).toBeVisible()
  })

  test("replaces what the change before it said", async ({ configure }) => {
    await configure.skillIn(web, FRAMEWORK, REACT).toggle()
    await expect(configure.toasts.named(REACT_ON)).toBeVisible()

    await configure.roster.skillRow(REACT, TESTER).click()

    await expect(configure.toasts.named(TESTER_OFF_REACT)).toBeVisible()
    await expect(configure.toasts.all).toHaveCount(1)
  })

  test("raises nothing for a skill that switches on nobody new", async ({
    configure,
  }) => {
    await configure.skillIn(web, FRAMEWORK, REACT).toggle()
    await expect(configure.toasts.named(REACT_ON)).toBeVisible()

    await configure.skillIn(web, STYLING, TAILWIND).toggle()

    await expect(configure.toasts.all).toHaveCount(1)
    await expect(configure.toasts.named(REACT_ON)).toBeVisible()
  })

  // Raised first: pressing a cell scrolls it into view, which can unpin the bar.
  test("sits clear of the pinned filter bar", async ({ configure }) => {
    await configure.skillIn(web, FRAMEWORK, REACT).toggle()
    await expect(configure.toasts.named(REACT_ON)).toBeVisible()

    await configure.scrollPastThePin()
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    const bar = await configure.filterBar.boundingBox()
    const toast = await configure.toasts.named(REACT_ON).boundingBox()
    if (!bar || !toast) throw new Error("the bar and the toast must be drawn")
    expect(toast.y).toBeGreaterThanOrEqual(bar.y + bar.height)
  })

  test("closes on its ✕", async ({ configure }) => {
    await configure.skillIn(web, FRAMEWORK, REACT).toggle()

    await configure.toasts.close(REACT_ON)

    await expect(configure.toasts.all).toHaveCount(0)
  })

  test("says once what a composer proposal switched on", async ({ page }) => {
    stubSignedIn(page)
    const configure = new ConfigurePage(page)
    await configure.goto()
    stubCompose(page, [skillIdNamed(REACT), skillIdNamed(TAILWIND)])

    await configure.composer.type(SENTENCE)
    await configure.composer.send()
    await expect(configure.composer.applyButton).toBeEnabled()
    await configure.composer.applyButton.click()

    await expect(configure.toasts.named(BATCH_ON)).toBeVisible()
    await expect(configure.toasts.all).toHaveCount(1)
  })
})

test.describe("a sub-agent the stack declares", () => {
  test("stays on, saying nothing, when every skill is taken off it", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    const rows = configure.roster.skillRowsOn(TESTER)
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)

    for (let index = 0; index < rowCount; index++) await rows.nth(index).click()

    await expect(configure.roster.liveSkillRowsOn(TESTER)).toHaveCount(0)
    await expect(configure.roster.agentButton("web", "tester")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.toasts.all).toHaveCount(0, BEFORE_A_TOAST_EXPIRES)
  })
})
