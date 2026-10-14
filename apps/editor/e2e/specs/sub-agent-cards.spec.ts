import type { Locator } from "@playwright/test"

import { expect, test } from "../fixtures"
import type { ConfigurePage } from "../pages/configure-page"
import type { SubAgentCards } from "../pages/sub-agent-cards"
import {
  AGENT_OPTIONS,
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  STACKS,
} from "../support/catalog"
import { captureCreateConfig } from "../support/sharing"

// `SUB_AGENT_GROUPS` as named literals, so a catalogue change fails here by
// name. Re-derive with:
//   bun -e 'import {SUB_AGENT_GROUPS} from "./packages/matrix/src/index.ts"; console.log(SUB_AGENT_GROUPS.map(g => [g.label, g.agents.map(a => a.label)]))'
const ROSTER: readonly {
  label: string
  domainId: string
  agents: readonly { id: string; label: string }[]
}[] = [
  {
    label: "Web",
    domainId: "web",
    agents: [
      { id: "web-developer", label: "Developer" },
      { id: "web-researcher", label: "Researcher" },
      { id: "web-tester", label: "Tester" },
    ],
  },
  {
    label: "API",
    domainId: "api",
    agents: [
      { id: "api-developer", label: "Developer" },
      { id: "api-researcher", label: "Researcher" },
      { id: "api-tester", label: "Tester" },
    ],
  },
  {
    label: "AI",
    domainId: "ai",
    agents: [
      { id: "ai-developer", label: "Developer" },
      { id: "ai-researcher", label: "Researcher" },
      { id: "ai-tester", label: "Tester" },
    ],
  },
  {
    label: "CLI",
    domainId: "cli",
    agents: [
      { id: "cli-developer", label: "Developer" },
      { id: "cli-researcher", label: "Researcher" },
      { id: "cli-tester", label: "Tester" },
    ],
  },
  {
    label: "Meta",
    domainId: "meta",
    agents: [
      { id: "agent-summoner", label: "Agent Summoner" },
      { id: "codex-keeper", label: "Codex Keeper" },
      { id: "convention-keeper", label: "Convention Keeper" },
      { id: "pm", label: "PM" },
      { id: "reviewer", label: "Reviewer" },
      { id: "skill-summoner", label: "Skill Summoner" },
    ],
  },
]

const AGENTS_STEP = "then your sub-agents"
const DEVELOPER = "web-developer"
const WEB = "Web"
const META = "Meta"
const LEFT_OUT_OF_CODEX = ["Agent Summoner", "Skill Summoner"] as const
const TERRA = "gpt-5.6-terra"
const SOL = "gpt-5.6-sol"
const NARROW = { width: 1400, height: 1000 }
const DESIGN = { width: 1684, height: 1000 }
// The threshold, where four cards across are at their narrowest.
const THRESHOLD = { width: 1500, height: 1000 }
// Below the editor's floor the page scrolls sideways, so the card is at its narrowest.
const FLOOR = { width: 1200, height: 1000 }

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY

// The rail names a row by the lowercased label, inside its domain's band.
const railAgent = (configure: ConfigurePage, domainId: string, label: string) =>
  configure.roster.agentButton(domainId, label.toLowerCase())

const isPressed = async (button: Locator) =>
  (await button.getAttribute("aria-pressed")) === "true"

const line = (cell: Locator) =>
  cell.evaluate((node) => {
    const after = getComputedStyle(node, "::after")
    return {
      content: after.content,
      outlineWidth: after.outlineWidth,
      outlineColor: after.outlineColor,
      top: parseFloat(after.top),
    }
  })

// The first painted layer inside an effort radio: the bar, wherever it is drawn.
const bar = (radio: Locator) =>
  radio.evaluate((node) => {
    const layers = [node, ...node.querySelectorAll("*")].flatMap((element) =>
      [null, "::before", "::after"].map((pseudo) =>
        getComputedStyle(element, pseudo)
      )
    )
    const painted = layers.find(
      (style) => style.backgroundColor !== "rgba(0, 0, 0, 0)"
    )
    if (!painted) throw new Error("the radio paints no bar")
    return {
      colour: painted.backgroundColor,
      width: parseFloat(painted.width),
      height: parseFloat(painted.height),
    }
  })

const typeOf = (text: Locator) =>
  text.evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      family: style.fontFamily,
      size: style.fontSize,
      weight: style.fontWeight,
      tracking: style.letterSpacing,
      transform: style.textTransform,
      colour: style.color,
    }
  })

const boxOf = async (target: Locator) => {
  const box = await target.boundingBox()
  if (!box) throw new Error("the element must be drawn")
  return box
}

// Design px ÷ 16 → rem, against the 110% root.
const pxPerDesignPx = (configure: ConfigurePage) =>
  configure.page.evaluate(
    () => parseFloat(getComputedStyle(document.documentElement).fontSize) / 16
  )

const expectDesignPx = (actual: number, design: number, unit: number) =>
  expect(Math.abs(actual - design * unit)).toBeLessThanOrEqual(1)

type ModelRow = { model: Locator; segment: Locator }

const claudeRow = (cards: SubAgentCards): ModelRow => ({
  model: cards.modelGroup(DEVELOPER),
  segment: cards.modelGroup(DEVELOPER).getByRole("radio").first(),
})

const codexRow = (cards: SubAgentCards): ModelRow => ({
  model: cards.codexModelGroup(DEVELOPER),
  segment: cards.codexModelGroup(DEVELOPER).getByRole("button").first(),
})

// The cell is overflow-hidden, so a group past its padding is clipped.
const expectRowUnclipped = async (
  cards: SubAgentCards,
  { model, segment }: ModelRow
) => {
  const contentRight = await cards
    .cell(WEB, "Developer")
    .evaluate(
      (node) =>
        node.getBoundingClientRect().right -
        parseFloat(getComputedStyle(node).paddingRight)
    )
  const { height } = await boxOf(segment)

  for (const group of [model, cards.scopeGroup(DEVELOPER)]) {
    const box = await boxOf(group)
    expect(box.height).toBeCloseTo(height, 0)
    expect(box.x + box.width).toBeLessThanOrEqual(contentRight + 0.5)
  }
}

const expectOneLine = async (cards: SubAgentCards, row: ModelRow) => {
  await expectRowUnclipped(cards, row)
  const model = await boxOf(row.model)
  const scope = await boxOf(cards.scopeGroup(DEVELOPER))
  expect(scope.y).toBeCloseTo(model.y, 0)
}

const expectWrapped = async (cards: SubAgentCards, row: ModelRow) => {
  await expectRowUnclipped(cards, row)
  const model = await boxOf(row.model)
  const scope = await boxOf(cards.scopeGroup(DEVELOPER))
  expect(scope.y).toBeGreaterThanOrEqual(model.y + model.height)
}

const onCodex = async (configure: ConfigurePage) => {
  await expect(configure.subAgents.modelGroup(DEVELOPER)).toBeVisible()
  await configure.provider.choose("codex")
}

const expectPressedCodexModel = async (
  cards: SubAgentCards,
  pressed: string | null
) => {
  for (const id of AGENT_OPTIONS.codexChoices) {
    await expect(cards.codexModelButton(DEVELOPER, id)).toHaveAttribute(
      "aria-pressed",
      String(id === pressed)
    )
  }
}

const expectRadios = async (group: Locator, names: readonly string[]) => {
  const radios = group.getByRole("radio")
  await expect(radios).toHaveCount(names.length)
  for (const [index, name] of names.entries()) {
    await expect(radios.nth(index)).toHaveAccessibleName(name)
  }
}

test.describe("the sub-agent step", () => {
  test("draws one group per domain, in catalogue order", async ({
    configure,
  }) => {
    const cards = configure.subAgents

    await expect(cards.groups).toHaveCount(ROSTER.length)
    for (const [index, { label }] of ROSTER.entries()) {
      await expect(cards.groups.nth(index)).toHaveAccessibleName(
        `${label} sub-agents`
      )
    }
  })

  test("each group holds its domain's sub-agents, in order", async ({
    configure,
  }) => {
    const cards = configure.subAgents

    for (const { label, agents } of ROSTER) {
      const group = cards.cards(label)
      await expect(group).toHaveCount(agents.length)
      for (const [index, agent] of agents.entries()) {
        await expect(group.nth(index)).toHaveAccessibleName(agent.label)
      }
    }
  })

  test("no group header carries an exclusivity tag", async ({ configure }) => {
    const cards = configure.subAgents

    for (const { label } of ROSTER) {
      await expect(cards.group(label)).toContainText(label)
      await expect(cards.group(label)).not.toContainText(/\bmulti\b|one of/i)
    }
  })

  test("heads a group in the skill category label's type", async ({
    configure,
  }) => {
    const header = configure.subAgents
      .group(WEB)
      .getByText(WEB, { exact: true })
    const categoryLabel = configure
      .category(web, CATEGORY)
      .getByText(CATEGORY, { exact: true })
    await expect(header).toBeVisible()

    expect(await typeOf(header)).toStrictEqual(await typeOf(categoryLabel))
  })

  test("sets the header 22 design px below the group's top", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    const header = cards.group(WEB).getByText(WEB, { exact: true })
    await expect(header).toBeVisible()

    const group = await boxOf(cards.group(WEB))
    const text = await boxOf(header)

    expectDesignPx(text.y - group.y, 22, await pxPerDesignPx(configure))
  })

  // The domain tabs jump to the first anchor carrying their id.
  test("marks no domain anchor", async ({ configure }) => {
    const cards = configure.subAgents
    await expect(cards.group(WEB)).toBeVisible()

    await expect(cards.groups.locator("[data-domain-anchor]")).toHaveCount(0)
  })

  test("the 03 title folds the groups away and brings them back", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    const title = configure.stepTitle(AGENTS_STEP)
    await expect(cards.group(WEB)).toBeVisible()

    await title.click()
    await expect(cards.groups).toHaveCount(0)

    await title.click()
    await expect(cards.group(WEB)).toBeVisible()
  })

  test("a card draws its line in ::after (138a)", async ({ configure }) => {
    const cards = configure.subAgents
    const cell = cards.cell(WEB, "Developer")
    await expect(cell).toBeVisible()

    const drawn = await line(cell)
    expect(drawn.content).not.toBe("none")
    expect(drawn.outlineWidth).toBe("1px")
    expect(
      await cell.evaluate((node) => getComputedStyle(node).borderTopWidth)
    ).toBe("0px")
    expect(drawn.top).toBe(
      await cards
        .lattice(WEB)
        .evaluate((node) => parseFloat(getComputedStyle(node).paddingTop))
    )
  })

  test("lays a card out at the design's measurements", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await expect(cards.modelGroup(DEVELOPER)).toBeVisible()
    const unit = await pxPerDesignPx(configure)

    const cell = await boxOf(cards.cell(WEB, "Developer"))
    const name = await boxOf(cards.name(WEB, "Developer"))
    const effort = await boxOf(cards.effortGroup(DEVELOPER))
    const model = await boxOf(cards.modelGroup(DEVELOPER))
    const scope = await boxOf(cards.scopeGroup(DEVELOPER))

    expectDesignPx(name.x - cell.x, 12, unit)
    expectDesignPx(cell.x + cell.width - (effort.x + effort.width), 12, unit)
    expectDesignPx(effort.y - cell.y, 11, unit)
    expectDesignPx(effort.height, 16, unit)
    expectDesignPx(model.y - (effort.y + effort.height), 9, unit)
    expectDesignPx(model.x - cell.x, 8, unit)
    expectDesignPx(scope.x - (model.x + model.width), 6, unit)
    expectDesignPx(cell.y + cell.height - (model.y + model.height), 10, unit)
  })

  test("sets the name in 600 12px", async ({ configure }) => {
    const name = configure.subAgents.name(WEB, "Developer")
    await expect(name).toBeVisible()
    const unit = await pxPerDesignPx(configure)

    const type = await typeOf(name)
    expect(type.weight).toBe("600")
    expectDesignPx(parseFloat(type.size), 12, unit)
  })

  test("a card in a short group is as wide as one in a full row", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await expect(cards.cell(WEB, "Developer")).toBeVisible()

    const short = await cards.cell(WEB, "Developer").boundingBox()
    const full = await cards.cell(META, "PM").boundingBox()
    if (!short || !full) throw new Error("both cards must be drawn")

    expect(short.width).toBeGreaterThan(full.width - 2)
    expect(short.width).toBeLessThan(full.width + 2)
  })

  test("lays the cards out four across at the wide size", async ({
    configure,
  }) => {
    const lattice = configure.subAgents.lattice(WEB)
    await expect(lattice).toBeVisible()

    expect(await configure.latticeTracks(lattice)).toBe(4)
  })
})

test.describe("at the design width", () => {
  test.use({ viewport: DESIGN })

  test("both providers lay the model and scope on one line", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await expect(cards.modelGroup(DEVELOPER)).toBeVisible()

    await expectOneLine(cards, claudeRow(cards))

    await configure.provider.choose("codex")
    await expect(cards.codexModelGroup(DEVELOPER)).toBeVisible()

    await expectOneLine(cards, codexRow(cards))
  })
})

for (const viewport of [THRESHOLD, FLOOR]) {
  test.describe(`at ${viewport.width}px`, () => {
    test.use({ viewport })

    test("both providers wrap the scope under the model, clipping neither", async ({
      configure,
    }) => {
      const cards = configure.subAgents
      await expect(cards.modelGroup(DEVELOPER)).toBeVisible()

      await expectWrapped(cards, claudeRow(cards))

      await configure.provider.choose("codex")
      await expect(cards.codexModelGroup(DEVELOPER)).toBeVisible()

      await expectWrapped(cards, codexRow(cards))
    })
  })
}

test.describe("below the viewport threshold", () => {
  test.use({ viewport: NARROW })

  test("lays the cards out three across", async ({ configure }) => {
    const lattice = configure.subAgents.lattice(WEB)
    await expect(lattice).toBeVisible()

    expect(await configure.latticeTracks(lattice)).toBe(3)
  })
})

test.describe("pressing a card", () => {
  test("toggles it, and the rail's row follows", async ({ configure }) => {
    const cards = configure.subAgents
    const card = cards.card(WEB, "Developer")
    const rail = railAgent(configure, "web", "Developer")
    await expect(card).toHaveAttribute("aria-pressed", "false")

    await cards.toggle(WEB, "Developer")
    await expect(card).toHaveAttribute("aria-pressed", "true")
    await expect(rail).toHaveAttribute("aria-pressed", "true")

    await cards.toggle(WEB, "Developer")
    await expect(card).toHaveAttribute("aria-pressed", "false")
    await expect(rail).toHaveAttribute("aria-pressed", "false")
  })

  test("an installed card draws its line in brand, an off one in hairline", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await expect(cards.card(WEB, "Developer")).toBeVisible()
    await cards.toggle(WEB, "Developer")
    await expect(cards.card(WEB, "Developer")).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    expect((await line(cards.cell(WEB, "Developer"))).outlineColor).toBe(
      await configure.tokenColor("--color-brand")
    )
    expect((await line(cards.cell(WEB, "Researcher"))).outlineColor).toBe(
      await configure.tokenColor("--color-hairline")
    )
  })

  test("applying a stack presses exactly the cards the rail presses", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await configure.chooseStack(STACKS.nextjs)
    await expect(cards.card(WEB, "Developer")).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    const fromCards: string[] = []
    const fromRail: string[] = []
    for (const { label, domainId, agents } of ROSTER) {
      for (const agent of agents) {
        if (await isPressed(cards.card(label, agent.label)))
          fromCards.push(agent.id)
        if (await isPressed(railAgent(configure, domainId, agent.label)))
          fromRail.push(agent.id)
      }
    }

    expect(fromCards).toStrictEqual(fromRail)
    expect(fromCards.length).toBeLessThan(
      ROSTER.flatMap(({ agents }) => agents).length
    )
  })
})

test.describe("an off card", () => {
  test("keeps working controls, and pressing them leaves it off", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await expect(cards.modelGroup(DEVELOPER)).toBeVisible()

    await cards.setModel(DEVELOPER, "haiku")
    await cards.setEffort(DEVELOPER, "high")
    await cards.setScope(DEVELOPER, "project")

    await expect(cards.modelOption(DEVELOPER, "haiku")).toBeChecked()
    await expect(cards.effortOption(DEVELOPER, "high")).toBeChecked()
    await expect(cards.scopeOption(DEVELOPER, "project")).toBeChecked()
    await expect(cards.card(WEB, "Developer")).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    await expect(configure.roster.installButton).toContainText("0 agents")
  })

  test("stays white like an on card, and recedes only its name", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.page.mouse.move(0, 0)
    const on = cards.cell(WEB, "Developer")
    const off = cards.cell("API", "Developer")
    await expect(cards.card(WEB, "Developer")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(cards.card("API", "Developer")).toHaveAttribute(
      "aria-pressed",
      "false"
    )

    const white = await configure.tokenColor("--color-cell")
    await expect(on).toHaveCSS("background-color", white)
    await expect(off).toHaveCSS("background-color", white)

    const faint = await configure.tokenColor("--color-faint")
    await expect(cards.name("API", "Developer")).toHaveCSS("color", faint)
    await expect(cards.name(WEB, "Developer")).not.toHaveCSS("color", faint)
  })

  test("draws the effort word in brand ink when installed, field-faint when off", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const resting = AGENT_OPTIONS.restingEffort

    await expect(cards.effortWord(WEB, "Developer", resting)).toHaveCSS(
      "color",
      await configure.tokenColor("--color-brand-ink")
    )
    await expect(cards.effortWord("API", "Developer", resting)).toHaveCSS(
      "color",
      await configure.tokenColor("--color-field-faint")
    )
  })

  test("recedes its model and scope segments", async ({ configure }) => {
    const cards = configure.subAgents
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.page.mouse.move(0, 0)
    await expect(cards.card(WEB, "Developer")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    const resting = AGENT_OPTIONS.restingModel

    await expect(cards.modelOption(DEVELOPER, resting)).toHaveCSS(
      "background-color",
      await configure.tokenColor("--color-wash")
    )
    await expect(cards.modelOption("api-developer", resting)).toHaveCSS(
      "background-color",
      await configure.tokenColor("--color-recede-wash")
    )
    await expect(cards.modelOption("api-developer", "haiku")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)"
    )
    await expect(cards.scopeOption("api-developer", "project")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)"
    )
  })

  test("recedes its Codex model toggles", async ({ configure }) => {
    const cards = configure.subAgents
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await onCodex(configure)
    await cards.pressCodexModel(DEVELOPER, TERRA)
    await cards.pressCodexModel("api-developer", TERRA)
    await configure.page.mouse.move(0, 0)
    await expect(cards.card(WEB, "Developer")).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await expect(cards.codexModelButton(DEVELOPER, TERRA)).toHaveCSS(
      "background-color",
      await configure.tokenColor("--color-wash")
    )
    await expect(cards.codexModelButton("api-developer", TERRA)).toHaveCSS(
      "background-color",
      await configure.tokenColor("--color-recede-wash")
    )
    await expect(cards.codexModelButton("api-developer", SOL)).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)"
    )
  })

  test("a card switched off keeps its chosen effort", async ({ configure }) => {
    const cards = configure.subAgents
    await expect(cards.effortGroup(DEVELOPER)).toBeVisible()
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await cards.setEffort(DEVELOPER, "high")

    await cards.toggle(WEB, "Developer")

    await expect(cards.card(WEB, "Developer")).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    await expect(cards.effortOption(DEVELOPER, "high")).toBeChecked()
    await expect(cards.effortWord(WEB, "Developer", "high")).toBeVisible()
  })
})

test.describe("effort", () => {
  test("offers the five levels, resting on medium", async ({ configure }) => {
    const cards = configure.subAgents

    await expectRadios(cards.effortGroup(DEVELOPER), AGENT_OPTIONS.efforts)
    await expect(
      cards.effortOption(DEVELOPER, AGENT_OPTIONS.restingEffort)
    ).toBeChecked()
    await expect(
      cards.effortWord(WEB, "Developer", AGENT_OPTIONS.restingEffort)
    ).toBeVisible()
  })

  test("pressing the fourth bar checks xhigh, and the word follows", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await expect(cards.effortGroup(DEVELOPER)).toBeVisible()

    await cards.effortGroup(DEVELOPER).getByRole("radio").nth(3).click()

    await expect(cards.effortOption(DEVELOPER, "xhigh")).toBeChecked()
    await expect(cards.effortWord(WEB, "Developer", "xhigh")).toBeVisible()
    await expect(
      cards.effortWord(WEB, "Developer", AGENT_OPTIONS.restingEffort)
    ).toHaveCount(0)
  })

  test("fills the track up to the checked level", async ({ configure }) => {
    const cards = configure.subAgents
    const filled = cards.effortGroup(DEVELOPER).locator("[data-filled]")
    await expect(filled).toHaveCount(2)

    await cards.setEffort(DEVELOPER, "xhigh")

    await expect(filled).toHaveCount(4)
  })

  test("arrow keys move the level, and the track keeps one tab stop", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    const group = cards.effortGroup(DEVELOPER)
    await expect(group).toBeVisible()
    await cards.effortOption(DEVELOPER, AGENT_OPTIONS.restingEffort).focus()

    await configure.page.keyboard.press("ArrowRight")

    await expect(cards.effortOption(DEVELOPER, "high")).toBeChecked()
    await expect(cards.effortOption(DEVELOPER, "high")).toBeFocused()
    await expect(group.locator('[tabindex="0"]')).toHaveCount(1)
    await expect(cards.effortOption(DEVELOPER, "high")).toHaveAttribute(
      "tabindex",
      "0"
    )
  })

  test("draws each level as a 14×4 bar in a 16-tall hit, 5 apart", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    const radios = cards.effortGroup(DEVELOPER).getByRole("radio")
    await expect(radios.first()).toBeVisible()
    const unit = await pxPerDesignPx(configure)

    const first = await boxOf(radios.nth(0))
    const second = await boxOf(radios.nth(1))
    const word = await boxOf(
      cards.effortWord(WEB, "Developer", AGENT_OPTIONS.restingEffort)
    )
    const drawn = await bar(radios.nth(0))

    expectDesignPx(first.height, 16, unit)
    expectDesignPx(second.x - first.x, 14 + 5, unit)
    expectDesignPx(drawn.width, 14, unit)
    expectDesignPx(drawn.height, 4, unit)
    expectDesignPx(first.x - (word.x + word.width), 8, unit)
  })

  test("paints filled bars brand and empty ones hairline", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.page.mouse.move(0, 0)
    await expect(cards.card(WEB, "Developer")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    const radios = cards.effortGroup(DEVELOPER).getByRole("radio")

    expect((await bar(radios.nth(1))).colour).toBe(
      await configure.tokenColor("--color-brand")
    )
    expect((await bar(radios.nth(2))).colour).toBe(
      await configure.tokenColor("--color-hairline")
    )
  })

  test("an off card's filled bars recede to field-faint", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await expect(cards.card(WEB, "Developer")).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    await configure.page.mouse.move(0, 0)
    const radios = cards.effortGroup(DEVELOPER).getByRole("radio")

    expect((await bar(radios.nth(1))).colour).toBe(
      await configure.tokenColor("--color-field-faint")
    )
    expect((await bar(radios.nth(2))).colour).toBe(
      await configure.tokenColor("--color-hairline")
    )
  })

  test("an empty bar darkens to rule under the pointer", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    const last = cards.effortGroup(DEVELOPER).getByRole("radio").last()
    await expect(last).toBeVisible()
    const rule = await configure.tokenColor("--color-rule")

    await last.hover()

    await expect.poll(async () => (await bar(last)).colour).toBe(rule)
  })

  // Shift+Tab then Tab, so Chromium matches `:focus-visible`.
  test("a keyboard-focused level draws the ring", async ({ configure }) => {
    const cards = configure.subAgents
    const level = cards.effortOption(DEVELOPER, AGENT_OPTIONS.restingEffort)
    await expect(level).toBeVisible()
    await configure.page.mouse.move(0, 0)
    await level.focus()
    await configure.page.keyboard.press("Shift+Tab")
    await configure.page.keyboard.press("Tab")

    await expect(level).toBeFocused()
    expect(await level.evaluate((node) => node.matches(":focus-visible"))).toBe(
      true
    )
    expect(
      await level.evaluate((node) => getComputedStyle(node).boxShadow)
    ).toContain(await configure.tokenColor("--color-ring"))
  })

  test("offers the same five levels on Codex", async ({ configure }) => {
    const cards = configure.subAgents
    await expect(cards.effortGroup(DEVELOPER)).toBeVisible()

    await configure.provider.choose("codex")

    await expectRadios(cards.effortGroup(DEVELOPER), AGENT_OPTIONS.efforts)
  })
})

test.describe("model", () => {
  test("offers the Claude models, resting on the catalogue's", async ({
    configure,
  }) => {
    const cards = configure.subAgents

    await expectRadios(cards.modelGroup(DEVELOPER), AGENT_OPTIONS.models)
    await expect(
      cards.modelOption(DEVELOPER, AGENT_OPTIONS.restingModel)
    ).toBeChecked()
  })

  test("a picked model survives a reload", async ({ configure, page }) => {
    const cards = configure.subAgents
    await expect(cards.modelGroup(DEVELOPER)).toBeVisible()
    await cards.setModel(DEVELOPER, "haiku")
    await expect(cards.modelOption(DEVELOPER, "haiku")).toBeChecked()

    await page.reload()
    await configure.stacks.waitFor()

    await expect(cards.modelOption(DEVELOPER, "haiku")).toBeChecked()
  })
})

// Q5: toggles, none pressed at rest, which is the session's own model.
test.describe("Codex model", () => {
  test("offers the four Codex models as toggles, none pressed", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await onCodex(configure)

    const toggles = cards.codexModelGroup(DEVELOPER).getByRole("button")
    await expect(toggles).toHaveCount(AGENT_OPTIONS.codexChoices.length)
    for (const [index, id] of AGENT_OPTIONS.codexChoices.entries()) {
      await expect(toggles.nth(index)).toHaveAccessibleName(id)
    }
    await expectPressedCodexModel(cards, null)
  })

  test("draws no inherit control and no model radiogroup", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    const page = configure.page
    await onCodex(configure)
    await expect(cards.codexModelGroup(DEVELOPER)).toBeVisible()

    await expect(page.getByText("inherit", { exact: true })).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "inherit", exact: true })
    ).toHaveCount(0)
    await expect(
      page.getByRole("radio", { name: "inherit", exact: true })
    ).toHaveCount(0)
    await expect(
      cards.root.getByRole("radiogroup", { name: /^Model for / })
    ).toHaveCount(0)
  })

  test("a toggle is named by its id and reads its short label", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await onCodex(configure)

    await expect(cards.codexModelButton(DEVELOPER, TERRA)).toHaveText(
      /^terra$/i
    )
  })

  test("pressing a model presses it alone", async ({ configure }) => {
    const cards = configure.subAgents
    await onCodex(configure)

    await cards.pressCodexModel(DEVELOPER, TERRA)

    await expectPressedCodexModel(cards, TERRA)
  })

  test("pressing another model moves the press", async ({ configure }) => {
    const cards = configure.subAgents
    await onCodex(configure)
    await cards.pressCodexModel(DEVELOPER, TERRA)

    await cards.pressCodexModel(DEVELOPER, SOL)

    await expectPressedCodexModel(cards, SOL)
  })

  test("pressing the pressed model releases it", async ({ configure }) => {
    const cards = configure.subAgents
    await onCodex(configure)
    await cards.pressCodexModel(DEVELOPER, TERRA)
    await expectPressedCodexModel(cards, TERRA)

    await cards.pressCodexModel(DEVELOPER, TERRA)

    await expectPressedCodexModel(cards, null)
  })

  test("Space presses a focused model and Enter releases it", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    const terra = cards.codexModelButton(DEVELOPER, TERRA)
    await onCodex(configure)
    await terra.focus()

    await configure.page.keyboard.press("Space")
    await expectPressedCodexModel(cards, TERRA)

    await configure.page.keyboard.press("Enter")
    await expectPressedCodexModel(cards, null)
  })

  // Shift+Tab then Tab, so Chromium matches `:focus-visible`.
  test("a keyboard-focused model draws the ring", async ({ configure }) => {
    const cards = configure.subAgents
    const first = cards.codexModelButton(
      DEVELOPER,
      AGENT_OPTIONS.codexChoices[0]
    )
    await onCodex(configure)
    await configure.page.mouse.move(0, 0)
    await first.focus()
    await configure.page.keyboard.press("Shift+Tab")
    await configure.page.keyboard.press("Tab")

    await expect(first).toBeFocused()
    expect(await first.evaluate((node) => node.matches(":focus-visible"))).toBe(
      true
    )
    expect(
      await first.evaluate((node) => getComputedStyle(node).boxShadow)
    ).toContain(await configure.tokenColor("--color-ring"))
  })

  test("a pressed model survives a reload", async ({ configure, page }) => {
    const cards = configure.subAgents
    await onCodex(configure)
    await cards.pressCodexModel(DEVELOPER, TERRA)
    await expectPressedCodexModel(cards, TERRA)

    await page.reload()
    await configure.stacks.waitFor()
    // The provider is transient (ruling 3), so a reload lands on Claude.
    await onCodex(configure)

    await expectPressedCodexModel(cards, TERRA)
  })

  test("each provider keeps its own pick", async ({ configure }) => {
    const cards = configure.subAgents
    await expect(cards.modelGroup(DEVELOPER)).toBeVisible()
    await cards.setModel(DEVELOPER, "haiku")

    await configure.provider.choose("codex")
    await cards.pressCodexModel(DEVELOPER, TERRA)
    await expectPressedCodexModel(cards, TERRA)

    await configure.provider.choose("claude")
    await expect(cards.modelOption(DEVELOPER, "haiku")).toBeChecked()

    await configure.provider.choose("codex")
    await expectPressedCodexModel(cards, TERRA)
  })
})

test.describe("scope", () => {
  test("offers project and global, resting on global", async ({
    configure,
  }) => {
    const cards = configure.subAgents

    await expectRadios(cards.scopeGroup(DEVELOPER), ["project", "global"])
    await expect(
      cards.scopeOption(DEVELOPER, AGENT_OPTIONS.restingScope)
    ).toBeChecked()
  })
})

test.describe("what a share posts", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test("the chosen effort, on the agent's entry", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)
    const cards = configure.subAgents
    await expect(cards.effortGroup(DEVELOPER)).toBeVisible()
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await cards.effortGroup(DEVELOPER).getByRole("radio").nth(3).click()

    await configure.roster.shareLink()

    const [body] = posted
    expect(body!.agents).toStrictEqual({ [DEVELOPER]: { effort: "xhigh" } })
  })

  test("a Codex pick as codexModel, beside the Claude model", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)
    const cards = configure.subAgents
    await expect(cards.modelGroup(DEVELOPER)).toBeVisible()
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await cards.setModel(DEVELOPER, "haiku")
    await configure.provider.choose("codex")
    await cards.pressCodexModel(DEVELOPER, TERRA)

    await configure.roster.shareLink()

    const [body] = posted
    expect(body!.agents).toStrictEqual({
      [DEVELOPER]: { model: "haiku", codexModel: TERRA },
    })
  })

  test("no codexModel once the Codex pick is released", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)
    const cards = configure.subAgents
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await onCodex(configure)
    await cards.pressCodexModel(DEVELOPER, TERRA)
    await cards.pressCodexModel(DEVELOPER, TERRA)
    await expectPressedCodexModel(cards, null)

    await configure.roster.shareLink()

    const [body] = posted
    expect(body!.agents).toStrictEqual({})
  })
})

test.describe("on Codex", () => {
  test("the left-out sub-agents' cards are disabled, titled with the reason", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await expect(cards.group(META)).toBeVisible()

    await configure.provider.choose("codex")

    for (const label of LEFT_OUT_OF_CODEX) {
      await expect(cards.card(META, label)).toHaveAttribute(
        "aria-disabled",
        "true"
      )
      await expect(cards.card(META, label)).toHaveAttribute("title", /codex/i)
    }
  })

  test("a forced press on a left-out card changes nothing", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await expect(cards.card(META, "Agent Summoner")).toBeVisible()
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.provider.choose("codex")
    await expect(cards.card(META, "Agent Summoner")).toHaveAttribute(
      "aria-disabled",
      "true"
    )
    const stored = await configure.storedConfig()
    // `textContent`, which `toHaveText` compares; `innerText` is uppercased.
    const install = await configure.roster.installButton.textContent()
    if (install === null)
      throw new Error("the install button must carry its counts")

    await cards.toggle(META, "Agent Summoner", { force: true })

    await expect(cards.card(META, "Agent Summoner")).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    await expect(configure.roster.installButton).toHaveText(install)
    expect(await configure.storedConfig()).toBe(stored)
  })

  test("a left-out card's controls stay live", async ({ configure }) => {
    const cards = configure.subAgents
    await expect(cards.effortGroup("agent-summoner")).toBeVisible()
    await configure.provider.choose("codex")

    await cards.setEffort("agent-summoner", "high")

    await expect(cards.effortOption("agent-summoner", "high")).toBeChecked()
  })

  test("a card Codex compiles still toggles", async ({ configure }) => {
    const cards = configure.subAgents
    await expect(cards.card(META, "Reviewer")).toBeVisible()
    await configure.provider.choose("codex")

    await cards.toggle(META, "Reviewer")

    await expect(cards.card(META, "Reviewer")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  test("a left-out sub-agent pinned on Claude is drawn not installed, and keeps its pin", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    const summoner = cards.card(META, "Agent Summoner")
    await expect(summoner).toBeVisible()
    await cards.toggle(META, "Agent Summoner")
    await expect(summoner).toHaveAttribute("aria-pressed", "true")

    await configure.provider.choose("codex")
    await expect(summoner).toHaveAttribute("aria-pressed", "false")

    await configure.provider.choose("claude")
    await expect(summoner).toHaveAttribute("aria-pressed", "true")
  })
})

test.describe("on Claude", () => {
  test("no card is disabled, and the summoners toggle", async ({
    configure,
  }) => {
    const cards = configure.subAgents

    for (const label of LEFT_OUT_OF_CODEX) {
      const card = cards.card(META, label)
      await expect(card).toBeVisible()
      await expect(card).not.toHaveAttribute("aria-disabled", "true")

      await cards.toggle(META, label)
      await expect(card).toHaveAttribute("aria-pressed", "true")
    }
  })
})
