import type { Locator } from "@playwright/test"

import { expect, test } from "../fixtures"
import {
  AGENT_OPTIONS,
  DOMAIN_REACH,
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY

// Quiet-at-rest is a reveal, not a mount: the controls stay in the layout at
// zero opacity so nothing reflows when they fade in, which means "hidden" is an
// assertion on opacity rather than on visibility.
const opacityOf = (locator: Locator) =>
  locator.evaluate((node) => Number(getComputedStyle(node).opacity))

// The roster stores nothing — every line is derived from `assignments` and
// `agents`. These assertions are the guard on that: if a copy is ever
// introduced, the bands, the rows and the Install label will disagree with
// the grid.
test.describe("roster panel", () => {
  test("starts with every agent off", async ({ configure }) => {
    await expect(configure.roster.installButton).toContainText(
      "0 sub-agents and 0 skills"
    )
    await expect(configure.roster.domainBand("web")).toContainText("0 of")
    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "false")
  })

  // Infra fields no agents since its reviewer folded into the consolidated
  // `reviewer`, so it has no band to draw. The other domains keep three each:
  // the planner folded the same way.
  test("lists every domain that has agents", async ({ configure }) => {
    for (const domainId of ["web", "api", "ai", "cli", "meta"]) {
      await expect(configure.roster.domainBand(domainId)).toBeVisible()
    }
    await expect(configure.roster.domainBand("infra")).toBeHidden()
  })

  // The headline behaviour: selecting a skill assigns it to its own domain's
  // agents — every role flavor that domain fields — plus the two cross-domain
  // role agents, which is what switches them on. A web skill staying out of
  // the API column is the relevance rule, shared with the CLI's generator: a
  // sub-agent only carries skills it would reasonably use.
  test("selecting a skill enables its own domain's agents plus the role agents", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await expect(configure.roster.domainBand("web")).toContainText("3 of")
    for (const role of ["developer", "researcher", "tester"]) {
      await expect(configure.roster.agentButton("web", role)).toHaveAttribute(
        "aria-pressed",
        "true"
      )
      await expect(
        configure.roster.skillRow(REACT, `web-${role}`)
      ).toBeVisible()
    }
    // The consolidated pm and reviewer sit in the meta band and carry it.
    for (const agentId of ["pm", "reviewer"]) {
      await expect(
        configure.roster.agentButton("meta", agentId)
      ).toHaveAttribute("aria-pressed", "true")
      await expect(configure.roster.skillRow(REACT, agentId)).toBeVisible()
    }
    // Not past it: the whole API column stays dark.
    await expect(configure.roster.domainBand("api")).toContainText("0 of")
    await expect(configure.roster.skillRow(REACT, "api-developer")).toBeHidden()
    // The meta-flavor agents receive nothing by default, as ever — the band's
    // two lit agents are the role agents.
    await expect(configure.roster.domainBand("meta")).toContainText("2 of")
    await expect(
      configure.roster.skillRow(REACT, "agent-summoner")
    ).toBeHidden()
    await expect(configure.roster.installButton).toContainText(
      `${DOMAIN_REACH.web} sub-agents and 1 skill`
    )
  })

  test("a framework arrives preloaded on every agent it reaches", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await expect(
      configure.roster.loadWord(REACT, "web-developer")
    ).toHaveAccessibleName("Load mode: preloaded")
  })

  test("the reached agents pulse when the selection lands, then decay", async ({
    configure,
    page,
  }) => {
    // Pinned clock: the pulse's 2.6s decay must not race the assertions.
    await page.clock.install()
    await page.clock.pauseAt(Date.now())
    const developer = configure.roster.agentButton("web", "developer")

    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await expect(developer).toHaveClass(/bg-flash/)

    await page.clock.fastForward(2600)
    await expect(developer).not.toHaveClass(/bg-flash/)
  })

  test("deselecting clears an in-flight pulse", async ({ configure, page }) => {
    await page.clock.install()
    await page.clock.pauseAt(Date.now())
    const developer = configure.roster.agentButton("web", "developer")
    const react = configure.skillIn(web, CATEGORY, REACT)

    await react.toggle()
    await expect(developer).toHaveClass(/bg-flash/)

    await react.toggle()
    await expect(developer).not.toHaveClass(/bg-flash/)
  })

  test("clicking an agent pins it off and back on", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const developer = configure.roster.agentButton("web", "developer")

    await developer.click()
    await expect(developer).toHaveAttribute("aria-pressed", "false")
    await expect(configure.roster.domainBand("web")).toContainText("2 of")
    // The deselected agent keeps its skills listed, recessed.
    await expect(
      configure.roster.skillRow(REACT, "web-developer")
    ).toBeVisible()

    await developer.click()
    await expect(developer).toHaveAttribute("aria-pressed", "true")
    await expect(configure.roster.domainBand("web")).toContainText("3 of")
  })

  test("a pinned bare agent reads as a base agent", async ({ configure }) => {
    await configure.roster.agentButton("web", "developer").click()

    await expect(configure.roster.root).toContainText("no skills — base agent")
    await expect(configure.roster.installButton).toContainText(
      "1 sub-agent and 0 skills"
    )
  })

  test("clicking a skill row switches that copy off without removing it", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const row = configure.roster.skillRow(REACT, "web-developer")

    await row.click()
    await expect(row).toHaveAttribute("aria-pressed", "false")
    // Its agent loses its only skill and derives off; the grid count follows.
    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "false")
    await expect(configure.skillIn(web, CATEGORY, REACT).agentCount).toHaveText(
      `${DOMAIN_REACH.web - 1} agents`
    )

    await row.click()
    await expect(row).toHaveAttribute("aria-pressed", "true")
  })

  test("the load word flips between pre and lazy", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const load = configure.roster.loadWord(REACT, "web-developer")

    await load.click()
    await expect(load).toHaveAccessibleName("Load mode: lazy")
    await load.click()
    await expect(load).toHaveAccessibleName("Load mode: preloaded")
  })

  test("domains collapse and expand", async ({ configure }) => {
    const band = configure.roster.domainBand("web")
    const developer = configure.roster.agentButton("web", "developer")

    await expect(band).toHaveAttribute("aria-expanded", "true")
    await expect(developer).toBeVisible()

    await configure.roster.toggleDomain("web")
    await expect(band).toHaveAttribute("aria-expanded", "false")
    await expect(developer).toBeHidden()

    await configure.roster.toggleDomain("web")
    await expect(developer).toBeVisible()
  })

  // Only skills on more than one agent get a target, and the tooltip names
  // every carrier with the pointed-from agent marked.
  test("hovering the where-used number lists every carrier", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const uses = configure.roster.whereUsed(REACT, "web-developer")

    await expect(uses).toHaveText(String(DOMAIN_REACH.web))
    await uses.hover()

    const tip = configure.roster.whereUsedTip
    await expect(tip).toBeVisible()
    await expect(tip).toContainText("web developer")
    await expect(tip).toContainText("web researcher")
    await expect(tip).toContainText("web tester")
    // The two cross-domain role agents carry it too, listed under their meta
    // group.
    await expect(tip).toContainText("meta reviewer")
    await expect(tip).toContainText("meta pm")
    // Relevance keeps the skill away from other domains' implementation
    // agents, so the carriers the tooltip lists never reach past it.
    await expect(tip).not.toContainText("api developer")
    await expect(tip).not.toContainText("api researcher")

    await configure.roster.heading.hover()
    await expect(tip).toBeHidden()
  })

  test("applying a stack populates agents and counts", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.roster.installButton).not.toContainText(
      "0 sub-agents"
    )
    await expect(configure.roster.domainBand("web")).not.toContainText("0 of")
  })

  test("load state renders as a word, never an icon", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)

    // Anchored on the load-word button itself, so a skill-name substring
    // elsewhere in the panel can never satisfy it.
    await expect(
      configure.roster.loadWord(STACK_MEMBER_SKILL, "web-developer")
    ).toHaveText(/^(pre|lazy)$/)
  })

  // Regression: each band used to sit in its own <section>, which is the
  // containing block `position: sticky` is confined to — so a band could only
  // stay pinned while its own group was on screen. The previous domain
  // vanished as the next one pinned, and since band N pins at N x band-height,
  // the strip above it was left uncovered with rows scrolling through it,
  // which read as the band sitting under the content.
  test("domain bands stack rather than replace each other", async ({
    configure,
    page,
  }) => {
    // A stack fills every agent with skill rows, which is what makes the rail
    // tall enough to scroll at all — with nothing selected it never overflows.
    await configure.chooseStack(STACKS.nextjs)

    const rail = page.locator("aside .rail-scrollbar")
    const bands = page.locator("aside .rail-scrollbar button[aria-expanded]")

    const total = await bands.count()
    const step = (await bands.first().boundingBox())!.height
    const railTop = (await rail.boundingBox())!.y

    await rail.evaluate((el) => el.scrollTo(0, el.scrollHeight))

    // Every band pinned flush at its own offset, none pushed out by the next.
    for (let index = 0; index < total; index++) {
      await expect
        .poll(async () => (await bands.nth(index).boundingBox())!.y, {
          message: `band ${index} should pin at ${index} x ${step}px`,
        })
        .toBeCloseTo(railTop + index * step, 0)
    }
  })
})

// Model and thinking effort belong to the sub-agent: a skill is a plugin from
// someone else's repo, so it has no business naming a model. Both controls sit
// right-aligned on the agent's name row, beside the pin rather than inside it.
test.describe("agent model and effort", () => {
  test("the model word rests on the agent's own catalogue default", async ({
    configure,
  }) => {
    const model = configure.roster.modelWord("web-developer")

    await expect(model).toHaveText(AGENT_OPTIONS.restingModel)
    await expect(model).toHaveAccessibleName(
      `Model for web-developer: ${AGENT_OPTIONS.restingModel}`
    )
  })

  // opus → fable → sonnet → haiku, starting from wherever the agent rests.
  test("clicking the model word cycles it", async ({ configure }) => {
    const model = configure.roster.modelWord("web-developer")

    await model.click()

    await expect(model).toHaveText("fable")
    await expect(model).toHaveAccessibleName("Model for web-developer: fable")
  })

  // It sits on the agent's row, so the one thing it must never do is pin it.
  test("choosing a model does not switch the agent on", async ({
    configure,
  }) => {
    const developer = configure.roster.agentButton("web", "developer")

    await expect(developer).toHaveAttribute("aria-pressed", "false")
    await configure.roster.modelWord("web-developer").click()

    await expect(developer).toHaveAttribute("aria-pressed", "false")
    await expect(configure.roster.installButton).toContainText("0 sub-agents")
  })

  test("the effort meter rests on medium and cycles upward", async ({
    configure,
  }) => {
    const effort = configure.roster.effortMeter("web-developer")

    await expect(effort).toHaveAccessibleName(
      `Effort for web-developer: ${AGENT_OPTIONS.restingEffort}`
    )

    // low → medium → high → xhigh → max → low, so two steps from medium is
    // xhigh.
    await effort.click()
    await effort.click()

    await expect(effort).toHaveAccessibleName("Effort for web-developer: xhigh")
  })

  test("choosing an effort does not switch the agent on", async ({
    configure,
  }) => {
    const developer = configure.roster.agentButton("web", "developer")

    await configure.roster.effortMeter("web-developer").click()

    await expect(developer).toHaveAttribute("aria-pressed", "false")
  })

  // An agent switched off still installs nothing, but it keeps the settings it
  // would install with — recessed, not removed, exactly like its skill rows.
  test("a pinned-off agent keeps both controls", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const developer = configure.roster.agentButton("web", "developer")

    await developer.click()
    await expect(developer).toHaveAttribute("aria-pressed", "false")

    await expect(configure.roster.modelWord("web-developer")).toBeVisible()
    await expect(configure.roster.effortMeter("web-developer")).toBeVisible()
  })
})

// Nothing on the right edge of a skill row may compete with the effort meter
// above it, so the load word and the where-used count are invisible until the
// pointer — or the keyboard — is somewhere in the agent's block.
test.describe("quiet at rest", () => {
  // The reveal is opacity only: the word holds its place in the layout at rest,
  // or every row beneath it would move the moment the pointer arrived.
  test("the load word is hidden until the agent block is hovered", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const load = configure.roster.loadWord(REACT, "web-developer")

    expect(await opacityOf(load)).toBe(0)
    const atRest = (await load.boundingBox())!

    await configure.roster.agentButton("web", "developer").hover()
    await expect.poll(() => opacityOf(load)).toBe(1)

    expect(await load.boundingBox()).toMatchObject({
      x: atRest.x,
      y: atRest.y,
      width: atRest.width,
      height: atRest.height,
    })
  })

  test("the where-used count is hidden until the agent block is hovered", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const uses = configure.roster.whereUsed(REACT, "web-developer")

    expect(await opacityOf(uses)).toBe(0)

    await configure.roster.agentButton("web", "developer").hover()
    await expect.poll(() => opacityOf(uses)).toBe(1)
  })

  // Hovering a skill row is still inside the same block, so the whole group
  // reveals together rather than row by row.
  test("hovering one row reveals the whole block", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const uses = configure.roster.whereUsed(REACT, "web-developer")

    expect(await opacityOf(uses)).toBe(0)

    await configure.roster.skillRow(REACT, "web-developer").hover()

    await expect
      .poll(() => opacityOf(configure.roster.loadWord(REACT, "web-developer")))
      .toBe(1)
    await expect.poll(() => opacityOf(uses)).toBe(1)
  })

  // Keyboard equivalence: focus anywhere in the block does what hover does.
  test("focus inside the block reveals it too", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const load = configure.roster.loadWord(REACT, "web-developer")

    expect(await opacityOf(load)).toBe(0)

    await configure.roster.agentButton("web", "developer").focus()
    await expect.poll(() => opacityOf(load)).toBe(1)
  })

  // The block ends at the agent: pointing at one agent must not light up the
  // next one's rows.
  test("a neighbouring agent stays quiet", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const neighbour = configure.roster.loadWord(REACT, "web-researcher")

    await configure.roster.agentButton("web", "developer").hover()

    await expect
      .poll(() => opacityOf(configure.roster.loadWord(REACT, "web-developer")))
      .toBe(1)
    expect(await opacityOf(neighbour)).toBe(0)
  })
})
