import type { Page } from "@playwright/test"

import {
  cliMintedPayload,
  cliMintedStackPayload,
  freshlyPickedSkill,
  projectMintedPayload,
  projectOwnSkill,
} from "@workspace/api-mocks/fixtures"
import { CATALOG, type SeedPayload } from "@workspace/matrix"

import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"
import { stubCompose, stubSignedIn } from "../support/auth"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  MULTI_CATEGORY,
  STACKS,
  stackIdOf,
} from "../support/catalog"
import { stubGetConfig } from "../support/sharing"

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

test.describe("a sub-agent whose last skill goes", () => {
  const LINK_ID = "LastSkl1"

  // Written out: the payload names skills by id.
  const REACT_ID = "web-framework-react"
  const TAILWIND_ID = "web-styling-tailwind"
  const HONO_ID = "api-framework-hono"
  const API_DEV = "api-developer"

  const REACT_OFF =
    "web developer, web researcher, web tester and 2 more switched off: React removed"
  const DEVELOPER_OFF_REACT = "web developer switched off: React removed"
  const API_DEVELOPER_OFF = "api developer switched off: Hono removed"
  const TAILWIND_OFF =
    "web developer, web researcher, web tester and 2 more switched off: Tailwind CSS removed"

  // React's row on the web developer is preloaded, so one press empties it.
  const MATRIX_DOMAIN = "Web"
  const MATRIX_ROLE = "dev"

  const opening = async (page: Page, payload: SeedPayload) => {
    stubGetConfig(page, LINK_ID, payload)
    await page.goto(`/?fromId=${LINK_ID}`)
  }

  const onlyHono = () => ({ [HONO_ID]: projectOwnSkill([API_DEV]) })

  test("goes off with the toast when the grid deselects it on a link the CLI minted", async ({
    configure,
    page,
  }) => {
    await opening(
      page,
      cliMintedPayload({ [REACT_ID]: freshlyPickedSkill(REACT_ID) })
    )
    const react = configure.skillIn(web, FRAMEWORK, REACT)
    await expect(react.root).toHaveAttribute("aria-pressed", "true")

    await react.toggle()

    await expect(configure.toasts.named(REACT_OFF)).toBeVisible()
    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "false")
  })

  test("goes off with the toast when the roster takes it off a link the CLI minted", async ({
    configure,
    page,
  }) => {
    await opening(
      page,
      cliMintedPayload({ [TAILWIND_ID]: freshlyPickedSkill(TAILWIND_ID) })
    )

    await configure.roster.skillRow(TAILWIND, TESTER).click()

    await expect(configure.toasts.named(TESTER_OFF_TAILWIND)).toBeVisible()
    await expect(configure.roster.agentButton("web", "tester")).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  test("goes off with the toast when the options panel empties its cell on a link the CLI minted", async ({
    configure,
    page,
  }) => {
    await opening(
      page,
      cliMintedPayload({ [REACT_ID]: freshlyPickedSkill(REACT_ID) })
    )
    const react = configure.skillIn(web, FRAMEWORK, REACT)

    await react.openOptions()
    await react.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)

    await expect(configure.toasts.named(DEVELOPER_OFF_REACT)).toBeVisible()
    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "false")
  })

  // `share` run inside a project: its own sub-agents, and no mark.
  test("goes off with the toast on a link shared from a project", async ({
    configure,
    page,
  }) => {
    const { fromProject: _unmarked, ...shared } = projectMintedPayload(
      onlyHono(),
      [API_DEV]
    )
    await opening(page, shared)

    await configure.skill("Hono").toggle()

    await expect(configure.toasts.named(API_DEVELOPER_OFF)).toBeVisible()
    await expect(
      configure.roster.agentButton("api", "developer")
    ).toHaveAttribute("aria-pressed", "false")
  })

  test("goes off with the toast on a link a bare edit made inside a project", async ({
    configure,
    page,
  }) => {
    await opening(
      page,
      projectMintedPayload(
        { [REACT_ID]: freshlyPickedSkill(REACT_ID), ...onlyHono() },
        [API_DEV]
      )
    )

    await configure.skill("Hono").toggle()

    await expect(configure.toasts.named(API_DEVELOPER_OFF)).toBeVisible()
    await expect(
      configure.roster.agentButton("api", "developer")
    ).toHaveAttribute("aria-pressed", "false")
  })

  test("goes off with the toast when it was clicked on", async ({
    configure,
  }) => {
    const tester = configure.roster.agentButton("web", "tester")
    await tester.click()
    await expect(tester).toHaveAttribute("aria-pressed", "true")
    const tailwind = configure.skillIn(web, STYLING, TAILWIND)
    await tailwind.toggle()

    await tailwind.toggle()

    await expect(configure.toasts.named(TAILWIND_OFF)).toBeVisible()
    await expect(tester).toHaveAttribute("aria-pressed", "false")
  })

  test("stays off when it was clicked off and its last skill goes and comes back", async ({
    configure,
  }) => {
    const tailwind = configure.skillIn(web, STYLING, TAILWIND)
    await tailwind.toggle()
    const tester = configure.roster.agentButton("web", "tester")
    await tester.click()
    await expect(tester).toHaveAttribute("aria-pressed", "false")
    await tailwind.toggle()

    await tailwind.toggle()

    // The skill is back on the others, so the press has landed.
    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "true")
    await expect(tester).toHaveAttribute("aria-pressed", "false")
  })

  test("stays on, saying nothing, on a link that is a built-in stack", async ({
    configure,
    page,
  }) => {
    await opening(page, cliMintedStackPayload(stackIdOf(STACKS.nextjs)))
    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
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
