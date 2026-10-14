import type { Locator, Page } from "@playwright/test"

import { expect, test } from "../fixtures"
import {
  DOMAIN_REACH,
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  SINGLE_AGENT_SKILL,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY

// Written out rather than imported from the page object that locates them.
// Separator is space, U+00B7 MIDDLE DOT, space.
const HEADER_WORDS = "then assign skills"
const HEADER_INDEX = "05"
const GLOBAL_PATH = "~/.claude · global"
const PROJECT_PATH = "./.claude · project"
const CODEX_GLOBAL_PATH = "~/.codex · global"
const CODEX_REFUSAL = "1 skill needs a Codex placement"
const AGENT_OPTION_NAME = /^(Model|Effort|Scope) for /
// The air between the where-used list and the rail's left edge.
const TIP_GAP_PX = 7
// The skill row's load-word track, `1.875rem`.
const LOAD_TRACK_REM = 1.875
// v6 `.right .fl{padding:2px 4px}` round an 11.5px line, then `.ag`'s 8px.
const AGENT_ROW_DESIGN_PX = 18
const AGENT_PITCH_DESIGN_PX = 26

// A second ahead: the installed clock runs on while `pauseAt` is in flight, so
// pausing at "now" can land in its past.
const freezeClock = async (page: Page) => {
  await page.clock.install()
  await page.clock.pauseAt(Date.now() + 1000)
}

const opacityOf = (locator: Locator) =>
  locator.evaluate((node) => Number(getComputedStyle(node).opacity))

const inkStartOf = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error("the element must be drawn to be measured")

  return box.x
}

const rootFontPx = (locator: Locator) =>
  locator.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  )

// The roster stores nothing — every line is derived from `assignments` and
// `agents`, so a copy would make the rows and the Install label disagree with
// the grid.
test.describe("roster panel", () => {
  test("starts with every agent off", async ({ configure }) => {
    await expect(configure.roster.installButton).toContainText(
      "0 agents · 0 skills"
    )
    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "false")
  })

  // Infra fields no agents, so it has no band.
  test("lists every domain that has agents", async ({ configure }) => {
    for (const domainId of ["web", "api", "ai", "cli", "meta"]) {
      await expect(configure.roster.domainBand(domainId)).toBeVisible()
    }
    await expect(configure.roster.domainBand("infra")).toBeHidden()
  })

  // Relevance: a web skill reaches the web agents plus the cross-domain pm and
  // reviewer, and nobody else.
  test("selecting a skill enables its own domain's agents plus the role agents", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    for (const role of ["developer", "researcher", "tester"]) {
      await expect(configure.roster.agentButton("web", role)).toHaveAttribute(
        "aria-pressed",
        "true"
      )
      await expect(
        configure.roster.skillRow(REACT, `web-${role}`)
      ).toBeVisible()
    }
    for (const agentId of ["pm", "reviewer"]) {
      await expect(
        configure.roster.agentButton("meta", agentId)
      ).toHaveAttribute("aria-pressed", "true")
      await expect(configure.roster.skillRow(REACT, agentId)).toBeVisible()
    }
    await expect(
      configure.roster.agentButton("api", "developer")
    ).toHaveAttribute("aria-pressed", "false")
    await expect(configure.roster.skillRow(REACT, "api-developer")).toBeHidden()
    await expect(
      configure.roster.agentButton("meta", "agent summoner")
    ).toHaveAttribute("aria-pressed", "false")
    await expect(
      configure.roster.skillRow(REACT, "agent-summoner")
    ).toBeHidden()
    await expect(configure.roster.installButton).toContainText(
      `${DOMAIN_REACH.web} agents · 1 skill`
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
    await freezeClock(page)
    const row = configure.roster.agentRow("web", "developer")

    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await expect(row).toHaveClass(/bg-flash/)

    await page.clock.fastForward(2600)
    await expect(row).not.toHaveClass(/bg-flash/)
  })

  // Geometry rather than a class: the pulsing box measured against the hovered
  // one, which adds a fill and no geometry.
  test("paints the pulse on exactly the row hover highlights", async ({
    configure,
    page,
  }) => {
    await freezeClock(page)
    const row = configure.roster.agentRow("web", "developer")

    await row.hover()
    await expect(row).toHaveClass(/hover:bg-roster-hover/)
    const hovered = (await row.boundingBox())!

    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await expect(row).toHaveClass(/bg-flash/)
    const painted = (await row.boundingBox())!

    expect(painted.x).toBeCloseTo(hovered.x, 0)
    expect(painted.y).toBeCloseTo(hovered.y, 0)
    expect(painted.width).toBeCloseTo(hovered.width, 0)
    expect(painted.height).toBeCloseTo(hovered.height, 0)
  })

  test("moves nothing on the row as the pulse arrives", async ({
    configure,
    page,
  }) => {
    await freezeClock(page)
    const name = configure.roster.agentButton("web", "developer")

    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const pulsing = (await name.boundingBox())!

    await page.clock.fastForward(2600)
    await expect(configure.roster.agentRow("web", "developer")).not.toHaveClass(
      /bg-flash/
    )
    const resting = (await name.boundingBox())!

    expect(pulsing.x).toBeCloseTo(resting.x, 0)
    expect(pulsing.y).toBeCloseTo(resting.y, 0)
  })

  test("deselecting clears an in-flight pulse", async ({ configure, page }) => {
    await freezeClock(page)
    const row = configure.roster.agentRow("web", "developer")
    const react = configure.skillIn(web, CATEGORY, REACT)

    await react.toggle()
    await expect(row).toHaveClass(/bg-flash/)

    await react.toggle()
    await expect(row).not.toHaveClass(/bg-flash/)
  })

  test("clicking an agent pins it off and back on", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const developer = configure.roster.agentButton("web", "developer")

    await developer.click()
    await expect(developer).toHaveAttribute("aria-pressed", "false")
    // Its skills stay listed, recessed.
    await expect(
      configure.roster.skillRow(REACT, "web-developer")
    ).toBeVisible()

    await developer.click()
    await expect(developer).toHaveAttribute("aria-pressed", "true")
  })

  test("a pinned bare agent reads as a base agent", async ({ configure }) => {
    await configure.roster.agentButton("web", "developer").click()

    await expect(configure.roster.root).toContainText("no skills — base agent")
    await expect(configure.roster.installButton).toContainText(
      "1 agent · 0 skills"
    )
  })

  test("clicking a skill row switches that copy off without removing it", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const row = configure.roster.skillRow(REACT, "web-developer")

    await row.click()
    await expect(row).toHaveAttribute("aria-pressed", "false")
    // The agent loses its only live skill and derives off; the row stays.
    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "false")
    await expect(configure.roster.skillRowsFor(REACT)).toHaveCount(
      DOMAIN_REACH.web
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

  test("applying a stack populates agents and counts", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.roster.installButton).not.toContainText("0 agents")
    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "true")
  })

  test("load state renders as a word, never an icon", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)

    await expect(
      configure.roster.loadWord(STACK_MEMBER_SKILL, "web-developer")
    ).toHaveText(/^(pre|lazy)$/)
  })

  // Each band used to sit in a <section> box, which confines `position:
  // sticky`, so the previous band vanished as the next one pinned. Bands are
  // located by slot: other controls in the scroller carry `aria-expanded` too.
  test("domain bands stack rather than replace each other", async ({
    configure,
    page,
  }) => {
    // A stack is what makes the rail tall enough to scroll.
    await configure.chooseStack(STACKS.nextjs)

    const rail = page.locator("aside .rail-scrollbar")
    const bands = page.locator(
      'aside .rail-scrollbar [data-slot="roster-band"]'
    )

    const total = await bands.count()
    const step = (await bands.first().boundingBox())!.height
    const railTop = (await rail.boundingBox())!.y

    await rail.evaluate((el) => el.scrollTo(0, el.scrollHeight))

    for (let index = 0; index < total; index++) {
      await expect
        .poll(async () => (await bands.nth(index).boundingBox())!.y, {
          message: `band ${index} should pin at ${index} x ${step}px`,
        })
        .toBeCloseTo(railTop + index * step, 0)
    }
  })
})

test.describe("roster bands", () => {
  test("a band is named by its bare label and states no count", async ({
    configure,
  }) => {
    const band = configure.roster.domainBand("web")

    await expect(band).toHaveAttribute("aria-expanded", "true")
    await expect(band).not.toHaveText(/\d/)
  })

  test("domains collapse and expand, and the glyph says which way the next press goes", async ({
    configure,
  }) => {
    const band = configure.roster.domainBand("web")
    const glyph = configure.roster.bandGlyph("web")
    const developer = configure.roster.agentButton("web", "developer")

    await expect(glyph).toHaveAttribute("data-glyph", "minus")
    await expect(developer).toBeVisible()

    await configure.roster.toggleDomain("web")
    await expect(band).toHaveAttribute("aria-expanded", "false")
    await expect(glyph).toHaveAttribute("data-glyph", "plus")
    await expect(developer).toBeHidden()

    await configure.roster.toggleDomain("web")
    await expect(glyph).toHaveAttribute("data-glyph", "minus")
    await expect(developer).toBeVisible()
  })

  test("the glyph is faint at rest and takes the ink under the pointer", async ({
    configure,
  }) => {
    const glyph = configure.roster.bandGlyph("web")

    await expect(glyph).toHaveCSS(
      "color",
      await configure.tokenColor("--color-faint")
    )

    await configure.roster.domainBand("web").hover()

    await expect(glyph).toHaveCSS(
      "color",
      await configure.tokenColor("--color-ink")
    )
  })
})

// The rail holds no agent options: they live on the 03 cards. What a row still
// does is pin the agent, switch a skill off for it, and flip the load word.
test.describe("an agent's rows", () => {
  test("hold no agent options, and the pin, the row and the load word still act", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const { roster } = configure

    await expect(
      roster.root.getByRole("button", { name: AGENT_OPTION_NAME })
    ).toHaveCount(0)
    await expect(
      roster.root.getByRole("radiogroup", { name: AGENT_OPTION_NAME })
    ).toHaveCount(0)

    const developer = roster.agentButton("web", "developer")
    await developer.click()
    await expect(developer).toHaveAttribute("aria-pressed", "false")

    const row = roster.skillRow(REACT, "web-researcher")
    await row.click()
    await expect(row).toHaveAttribute("aria-pressed", "false")

    const load = roster.loadWord(REACT, "web-tester")
    await load.click()
    await expect(load).toHaveAccessibleName("Load mode: lazy")
  })

  test("show the load word with the pointer away", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const load = configure.roster.loadWord(REACT, "web-developer")

    await expect.poll(() => opacityOf(load)).toBe(1)
  })

  test("are three tracks: bullet, name, load word", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const cell = configure.roster.skillRowCell(REACT, "web-developer")

    const tracks = await cell.evaluate((node) =>
      getComputedStyle(node)
        .gridTemplateColumns.split(" ")
        .map((track) => Number.parseFloat(track))
    )

    expect(tracks).toHaveLength(3)
    expect(tracks[2]).toBeCloseTo(LOAD_TRACK_REM * (await rootFontPx(cell)), 0)
  })

  test("draw the name row 18 design px tall, with the first skill straight under it", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const row = configure.roster.agentRow("web", "developer")
    const designPx = (await rootFontPx(row)) / 16

    const name = (await row.boundingBox())!
    const skill = (await configure.roster
      .skillRowCell(REACT, "web-developer")
      .boundingBox())!

    expect(name.height / designPx).toBeCloseTo(AGENT_ROW_DESIGN_PX, 0)
    expect((skill.y - name.y) / designPx).toBeCloseTo(AGENT_ROW_DESIGN_PX, 0)
  })

  test("set agents with no skills 26 design px apart", async ({
    configure,
  }) => {
    const rows = configure.roster
      .domainSection("web")
      .locator('[data-slot="agent-row"]')
    const designPx = (await rootFontPx(rows.first())) / 16

    const first = (await rows.nth(0).boundingBox())!
    const second = (await rows.nth(1).boundingBox())!

    expect((second.y - first.y) / designPx).toBeCloseTo(
      AGENT_PITCH_DESIGN_PX,
      0
    )
  })
})

// Hovering anywhere on a skill row lists the live carriers of its skill, with
// no number to aim at.
test.describe("where-used", () => {
  test("hovering anywhere on a skill row lists every carrier", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const { roster } = configure
    const tip = roster.whereUsedTip

    await roster.loadWord(REACT, "web-developer").hover()

    await expect(tip).toBeVisible()
    for (const carrier of [
      "web developer",
      "web researcher",
      "web tester",
      "meta reviewer",
      "meta pm",
    ]) {
      await expect(tip).toContainText(carrier)
    }
    await expect(tip).not.toContainText("api developer")

    await roster.heading.hover()
    await expect(tip).toBeHidden()

    await roster.whereUsed(REACT, "web-developer")
    await expect(tip).toBeVisible()
  })

  test("a single carrier opens it, and a skill nobody carries live opens nothing", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    const { roster } = configure
    const { name, agentId } = SINGLE_AGENT_SKILL

    const tip = await roster.whereUsed(name, agentId)
    await expect(tip).toHaveText("web developer")

    await roster.skillRow(name, agentId).click()
    await roster.heading.hover()
    await roster.whereUsed(name, agentId)

    await expect(tip).toHaveCount(0)
  })

  test("keyboard focus on the row opens it, described by the list, and blur closes it", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const { roster } = configure
    const row = roster.skillRow(REACT, "web-developer")

    await row.focus()

    await expect(roster.whereUsedTip).toBeVisible()
    await expect(row).toHaveAccessibleDescription(/web researcher/)

    await roster.agentButton("web", "developer").focus()
    await expect(roster.whereUsedTip).toBeHidden()
  })

  test("a scroll closes it", async ({ configure, page }) => {
    await configure.chooseStack(STACKS.nextjs)
    const { roster } = configure

    await roster.skillRow(STACK_MEMBER_SKILL, "web-developer").focus()
    await expect(roster.whereUsedTip).toBeVisible()

    await page
      .locator("aside .rail-scrollbar")
      .evaluate((el) => el.scrollBy(0, 40))

    await expect(roster.whereUsedTip).toBeHidden()
  })

  test("sits left of the rail, a fixed gap off its edge", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const { roster } = configure

    const tip = await roster.whereUsed(REACT, "web-developer")
    await expect(tip).toBeVisible()

    const tipBox = (await tip.boundingBox())!
    const rail = (await roster.root.boundingBox())!

    expect(
      Math.abs(rail.x - TIP_GAP_PX - (tipBox.x + tipBox.width))
    ).toBeLessThan(1)
  })

  test("has no count button", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await expect(
      configure.roster.skillRow(REACT, "web-developer")
    ).toBeVisible()
    await expect(
      configure.roster.whereUsedCount(REACT, "web-developer")
    ).toHaveCount(0)
  })
})

test.describe("the 05 header", () => {
  test("reads then assign skills beside the index 05", async ({
    configure,
  }) => {
    await expect(configure.roster.heading).toHaveText(HEADER_WORDS)
    await expect(configure.roster.header).toContainText(HEADER_INDEX)
  })

  test("is text, not a control", async ({ configure }) => {
    const { header } = configure.roster

    await expect(header).toBeVisible()
    await expect(header.getByRole("button")).toHaveCount(0)
    await expect(header.getByRole("radiogroup")).toHaveCount(0)
  })

  test("draws the index in brand and the noun in primary ink", async ({
    configure,
  }) => {
    const { header, headerIndex } = configure.roster

    await expect(headerIndex).toHaveCSS(
      "color",
      await configure.tokenColor("--color-brand")
    )
    await expect(header.locator('[data-slot="hinge-emphasis"]')).toHaveCSS(
      "color",
      await configure.tokenColor("--color-ink-primary")
    )
  })

  test("captions the group-by control in faint ink", async ({ configure }) => {
    await expect(configure.roster.groupByCaption).toHaveCSS(
      "color",
      await configure.tokenColor("--color-faint")
    )
  })

  // One flush edge for the rail: the header's first ink, the group-by caption
  // and the band labels.
  test("starts its ink on the same edge as the caption and the bands", async ({
    configure,
  }) => {
    const band = await inkStartOf(configure.roster.bandLabel("web"))

    expect(await inkStartOf(configure.roster.headerIndex)).toBeCloseTo(band, 0)
    expect(await inkStartOf(configure.roster.groupByCaption)).toBeCloseTo(
      band,
      0
    )
  })
})

// Two bandings, one renderer: what changes is which band an agent falls into,
// what the band is called, and whether the row names its own domain.
test.describe("roster grouping", () => {
  const PREFIXED_DEVELOPER = "web · developer"
  const BARE_DEVELOPER = "developer"

  test("rests on domain, with the domain bands on screen", async ({
    configure,
  }) => {
    await expect(configure.roster.groupOption("domain")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(configure.roster.groupOption("scope")).toHaveAttribute(
      "aria-checked",
      "false"
    )
    await expect(configure.roster.domainBand("web")).toBeVisible()
    await expect(configure.roster.scopeBand("global")).toHaveCount(0)
  })

  test("one press on scope replaces the domain bands with the destination", async ({
    configure,
  }) => {
    await configure.roster.groupOption("scope").click()

    await expect(configure.roster.groupOption("scope")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(configure.roster.scopeBand("global")).toHaveText(GLOBAL_PATH)
    await expect(configure.roster.domainBand("web")).toHaveCount(0)
  })

  test("draws both destinations once an agent writes to the project", async ({
    configure,
  }) => {
    await configure.roster.groupBy("scope")
    await configure.subAgents.setScope("web-developer", "project")

    await expect(configure.roster.scopeBand("global")).toHaveText(GLOBAL_PATH)
    await expect(configure.roster.scopeBand("project")).toHaveText(PROJECT_PATH)
  })

  // A destination nobody writes to is not drawn — the state every visitor
  // opens on.
  test("draws only the destination that has agents", async ({ configure }) => {
    await configure.roster.groupBy("scope")

    await expect(configure.roster.scopeBand("global")).toBeVisible()
    await expect(configure.roster.scopeBand("project")).toHaveCount(0)
  })

  test("follows the provider's root on Codex", async ({ configure }) => {
    await configure.roster.groupBy("scope")
    await expect(configure.roster.scopeBand("global")).toHaveText(GLOBAL_PATH)

    await configure.provider.choose("codex")

    await expect(configure.roster.scopeBand("global")).toHaveText(
      CODEX_GLOBAL_PATH
    )
  })

  // The bare form's positive goes through the band, since four domains field
  // a `developer`; its negative stays panel-wide.
  test("the row names its own domain in scope mode and not in domain mode", async ({
    configure,
  }) => {
    await expect(
      configure.roster.agentButton("web", BARE_DEVELOPER)
    ).toBeVisible()
    await expect(configure.roster.agentNamed(PREFIXED_DEVELOPER)).toHaveCount(0)

    await configure.roster.groupBy("scope")

    await expect(configure.roster.agentNamed(PREFIXED_DEVELOPER)).toBeVisible()
    await expect(configure.roster.agentNamed(BARE_DEVELOPER)).toHaveCount(0)
  })

  test("moving an agent's scope moves its row to the other band", async ({
    configure,
  }) => {
    await configure.roster.groupBy("scope")
    await expect(configure.roster.scopeBand("project")).toHaveCount(0)

    await configure.subAgents.setScope("web-developer", "project")

    await expect(
      configure.roster.scopeAgent("project", PREFIXED_DEVELOPER)
    ).toBeVisible()
    await expect(
      configure.roster.scopeAgent("global", PREFIXED_DEVELOPER)
    ).toHaveCount(0)
  })

  // One `rosterCollapsed` record serves both modes with disjoint keys, so
  // neither resets the other.
  test("a band shut in domain mode is still shut after a trip through scope", async ({
    configure,
  }) => {
    await configure.roster.toggleDomain("web")
    await expect(configure.roster.domainBand("web")).toHaveAttribute(
      "aria-expanded",
      "false"
    )

    await configure.roster.groupBy("scope")
    await configure.roster.groupBy("domain")

    await expect(configure.roster.domainBand("web")).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    await expect(configure.roster.agentButton("web", "developer")).toBeHidden()
  })
})

test.describe("the rail footer", () => {
  // The provider is chosen in step 01, and a Codex placement error is drawn
  // on its skill cell. Install's refusal stays: it is the write contract.
  test("holds no provider control, and Install still names the refusal", async ({
    configure,
  }) => {
    await expect(
      configure.roster.root.getByRole("radiogroup", { name: "Provider" })
    ).toHaveCount(0)

    await configure.chooseStack(STACKS.nextjs)
    const { name, category, agentId } = SINGLE_AGENT_SKILL
    await configure.skillIn(web, category, name).setScope("project")
    // Off, so the project skill on a global sub-agent cannot block Install
    // for the other reason.
    await configure.roster.skillRow(name, agentId).click()

    await configure.provider.choose("codex")

    await expect(configure.roster.installButton).toContainText(CODEX_REFUSAL)
  })
})
