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

// `#5f5c52` — an agent's cycling word at rest, on an agent that is on.
const RESTING_WORD = "rgb(95, 92, 82)"
// `#a06a1c` — the reserved amber, and it means one thing only: the user chose
// this rather than taking what the row rests on.
const AMBER_TEXT = "rgb(160, 106, 28)"
// The roster's off-grey. A recessed agent's words take it whether
// the user chose them or not, which is what makes amber mean anything.
const RECESSED_WORD = "rgb(182, 176, 160)"

// The header's copy and the two destinations a scope band names, written out
// rather than imported from the page object that locates them: an assertion
// bound to the string its own locator was built from cannot fail, because both
// halves move together. Separator is space, U+00B7 MIDDLE DOT, space.
const HEADER_LABEL = "Sub-agents grouped by"
const GLOBAL_PATH = "~/.claude · global"
const PROJECT_PATH = "./.claude · project"

// The floor under the header's trailing rule. The label and the control are
// both `shrink-0`, so the rule is the only shrinkable item in a 300px column
// and without a floor it collapses to nothing and the treatment disappears.
const MIN_HEADER_RULE_PX = 10

// Quiet-at-rest is a reveal, not a mount: the controls stay in the layout at
// zero opacity so nothing reflows when they fade in, which means "hidden" is an
// assertion on opacity rather than on visibility.
const opacityOf = (locator: Locator) =>
  locator.evaluate((node) => Number(getComputedStyle(node).opacity))

// Where an element's ink starts, live. Two of these compared against each
// other is the only way to state the panel's one alignment rule: a visibility
// assertion is true of a header whose first ink sits 76px in, and so is every
// assertion about its text.
const inkStartOf = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error("the element must be drawn to be measured")

  return box.x
}

// The roster stores nothing — every line is derived from `assignments` and
// `agents`. These assertions are the guard on that: if a copy is ever
// introduced, the bands, the rows and the Install label will disagree with
// the grid.
test.describe("roster panel", () => {
  test("starts with every agent off", async ({ configure }) => {
    await expect(configure.roster.installButton).toContainText(
      "0 agents · 0 skills"
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
    // Pinned clock: the pulse's 2.6s decay must not race the assertions.
    await page.clock.install()
    await page.clock.pauseAt(Date.now())
    const row = configure.roster.agentRow("web", "developer")

    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await expect(row).toHaveClass(/bg-flash/)

    await page.clock.fastForward(2600)
    await expect(row).not.toHaveClass(/bg-flash/)
  })

  // THE PULSE PAINTS EXACTLY THE ROW THE POINTER HIGHLIGHTS, and this is the
  // assertion that says so.
  //
  // It has now been wrong in both directions. It sat on the pin button once,
  // which stops where the agent's three words begin, so a pulse left that
  // agent's own model, effort and scope outside the thing being pointed at.
  // Then it bled 17px left to the panel's border, 8px right into the scroller's
  // padding and 4px taller — a box wider and taller than anything else on the
  // row ever paints, which read as the agent's whole BLOCK having been tinted.
  //
  // Geometry rather than a class, because the class is present either way. The
  // resting box IS the hover box — hover adds a fill and no geometry — so
  // measuring the pulsing box against the resting one is measuring the two
  // states against each other with nothing written down that can go stale.
  test("paints the pulse on exactly the row hover highlights", async ({
    configure,
    page,
  }) => {
    await page.clock.install()
    await page.clock.pauseAt(Date.now())
    const row = configure.roster.agentRow("web", "developer")

    // The channel first: hover really does tint this element, or "the same box
    // as hover" is a claim about a box nothing paints.
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

  // The bleed is a padding and an equal negative margin, so the box grows and
  // the ink does not move. A pulse that shifted the row would be a 250ms nudge
  // of everything the reader was looking at.
  test("moves nothing on the row as the pulse arrives", async ({
    configure,
    page,
  }) => {
    await page.clock.install()
    await page.clock.pauseAt(Date.now())
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
    await page.clock.install()
    await page.clock.pauseAt(Date.now())
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
    // Its agent loses its only LIVE skill and derives off — while the row it
    // switched off is kept and still listed, which is the title's claim and the
    // reason the count of rows does not move.
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
    // BY SLOT, WHICH IS THE ONLY THING HERE THAT NAMES A BAND. `aria-expanded`
    // was the hook until 2026-09-06 and it caught two innocents in turn: the
    // grouping control, which Base UI writes the attribute on whether its menu
    // is open or not, and then every agent's option word, which discloses the
    // options panel. Both precede or sit among the bands in this scroller, so
    // one of them became `first()` and `step` became its height instead of the
    // band's 26px — with every offset below measured off the wrong ruler.
    //
    // A second `section`-scoped guess would only postpone the third one. The
    // slot is a contract; an ARIA attribute any disclosure may legitimately
    // carry is not.
    const bands = page.locator(
      'aside .rail-scrollbar [data-slot="roster-band"]'
    )

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

  // PICKED FROM THE PANEL, not cycled by the word. The word stepped opus →
  // fable → sonnet → haiku until the 2026-09-06 refresh, so three of the four
  // were invisible until you had clicked past them; it opens the panel now and
  // every model is on screen at once.
  test("a model is picked from the options panel", async ({ configure }) => {
    const model = configure.roster.modelWord("web-developer")

    await configure.roster.setModel("web-developer", "haiku")

    await expect(model).toHaveText("haiku")
    await expect(model).toHaveAccessibleName("Model for web-developer: haiku")
  })

  // THE WHOLE POINT OF THE PANEL, and the claim a cycling word could not make:
  // every value the setting has is on screen before anything is chosen, so what
  // a press will do is readable rather than discovered.
  test("the panel shows every model, effort and scope at once", async ({
    configure,
  }) => {
    await configure.roster.modelWord("web-developer").click()

    await expect(
      configure.roster.agentOptionColumn("web-developer", "Model")
    ).toContainText(AGENT_OPTIONS.models.join(""))
    await expect(
      configure.roster.agentOptionColumn("web-developer", "Effort")
    ).toContainText(AGENT_OPTIONS.efforts.join(""))
  })

  // ONE PANEL FOR THE THREE SETTINGS, opened by any of the words — the design
  // rejected per-word popovers by name, because three open states meant the
  // rightmost of them opened off the panel entirely.
  test("any of the three words opens the same panel", async ({ configure }) => {
    await configure.roster.effortWord("web-developer").click()

    await expect(
      configure.roster.agentOptionColumn("web-developer", "Model")
    ).toBeVisible()
    await expect(
      configure.roster.agentOptionColumn("web-developer", "Scope")
    ).toBeVisible()
  })

  // ONE OPEN ACROSS THE WHOLE ROSTER. Held per row, "one at a time" would be a
  // rule every row kept about itself and none of them kept about each other.
  //
  // THE SECOND AGENT IS OPENED FIRST, AND THAT IS THE TEST RATHER THAN AN
  // ARRANGEMENT OF IT: the panel floats DOWN over the skill rows beneath its
  // agent, so an open panel physically covers the words of every agent below it
  // and none of the words above it. Reaching for the row under an open panel is
  // not a thing a person can do either, so a spec that did it would be pinning
  // an interaction the design does not have.
  test("opening one agent's panel closes another's", async ({ configure }) => {
    await configure.roster.modelWord("web-researcher").click()
    await expect(
      configure.roster.agentOptionColumn("web-researcher", "Model")
    ).toBeVisible()

    await configure.roster.modelWord("web-developer").click()

    await expect(
      configure.roster.agentOptionColumn("web-researcher", "Model")
    ).toHaveCount(0)
    await expect(
      configure.roster.agentOptionColumn("web-developer", "Model")
    ).toBeVisible()
  })

  // ALIGNMENT IS STRUCTURAL RATHER THAN TUNED, and this is the assertion that
  // says so. The closed row and the open panel declare the SAME three tracks,
  // so a header cannot drift off the word it covers — per-column padding was
  // the design's first attempt and every column was off.
  //
  // It caught a real 4.38px on the way in: the panel's right padding carried
  // its bleed past the block's edge but not the row's own `--rp`, so all three
  // headers landed a quarter-rem right of their words. A picture would not have
  // shown that, and no assertion in this suite measured a box on this row.
  test("every panel header lands exactly on the word it covers", async ({
    configure,
  }) => {
    const wordsAt = () =>
      configure.roster.root
        .locator('[data-slot="agent-row"]')
        .first()
        .locator("button[aria-expanded]")
        .evaluateAll((words) => words.map((w) => w.getBoundingClientRect().x))

    const before = await wordsAt()
    await configure.roster.modelWord("web-developer").click()

    const headers = await configure.roster
      .agentOptions("web-developer")
      .locator(":scope > button")
      .evaluateAll((cells) => cells.map((c) => c.getBoundingClientRect().x))

    expect(headers).toHaveLength(before.length)
    headers.forEach((x, index) => expect(x).toBeCloseTo(before[index]!, 0))
  })

  // The header sits exactly where the word was and means the same thing, so the
  // same pixel closes what it opened.
  test("pressing the word again closes the panel", async ({ configure }) => {
    await configure.roster.modelWord("web-developer").click()
    await expect(
      configure.roster.agentOptionColumn("web-developer", "Model")
    ).toBeVisible()

    await configure.roster.modelWord("web-developer").click()

    await expect(
      configure.roster.agentOptionColumn("web-developer", "Model")
    ).toHaveCount(0)
  })

  // It sits on the agent's row, so the one thing it must never do is pin it.
  test("choosing a model does not switch the agent on", async ({
    configure,
  }) => {
    const developer = configure.roster.agentButton("web", "developer")

    await expect(developer).toHaveAttribute("aria-pressed", "false")
    await configure.roster.setModel("web-developer", "haiku")

    await expect(developer).toHaveAttribute("aria-pressed", "false")
    await expect(configure.roster.installButton).toContainText("0 agents")
  })

  test("the effort word rests on medium, and any step is one press", async ({
    configure,
  }) => {
    const effort = configure.roster.effortWord("web-developer")

    // The value is the visible text as well as the accessible name now, the
    // same as the model word beside it — a drawn meter said it only once.
    await expect(effort).toHaveText(AGENT_OPTIONS.restingEffort)
    await expect(effort).toHaveAccessibleName(
      `Effort for web-developer: ${AGENT_OPTIONS.restingEffort}`
    )

    // `xhigh` was three steps from `medium` while the word cycled low → medium
    // → high → xhigh → max, and the four it was not on were invisible. It is
    // one press in the panel, which is the whole reason the panel exists — of
    // the three settings, effort is the one with five values.
    await configure.roster.setEffort("web-developer", "xhigh")

    await expect(effort).toHaveText("xhigh")
    await expect(effort).toHaveAccessibleName("Effort for web-developer: xhigh")
  })

  // Amber means "the user chose this", and nothing in the suite asserted a
  // colour on any of the three words before — so the one signal that
  // distinguishes a chosen effort from a resting one had no channel at all.
  test("the effort word goes amber once it leaves the resting value", async ({
    configure,
  }) => {
    // Amber is suppressed on a recessed agent, so the agent has to be on for
    // there to be an amber rule to assert at all — the same way the pinned-off
    // test below reaches its state, and the case this leaves out is the test
    // that follows the next one.
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const effort = configure.roster.effortWord("web-developer")

    // The channel first: at rest it is the ordinary word colour, so the
    // assertion below can tell a state from a stylesheet.
    await expect(effort).toHaveCSS("color", RESTING_WORD)

    await configure.roster.setEffort("web-developer", "high")

    await expect(effort).toHaveCSS("color", AMBER_TEXT)
  })

  // The design's own cascade darkens the amber word on hover by accident;
  // here it must not, because hovering something must never mask the fact
  // that the user chose it.
  test("the amber word does not darken under the pointer", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const effort = configure.roster.effortWord("web-developer")

    await configure.roster.setEffort("web-developer", "high")
    await expect(effort).toHaveCSS("color", AMBER_TEXT)

    await effort.hover()

    await expect(effort).toHaveCSS("color", AMBER_TEXT)
  })

  // The other half of the two above, and neither means much without it: an
  // amber assertion on its own cannot tell a rule that fires when the user
  // chose something from one that fires whenever the value is not the resting
  // one. A recessed agent installs nothing, so its choice is kept and its
  // colour is not — which is also why both tests above have to switch the
  // agent on before they can see amber at all.
  test("a recessed agent keeps its chosen effort without the amber", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const effort = configure.roster.effortWord("web-developer")
    const developer = configure.roster.agentButton("web", "developer")

    await configure.roster.setEffort("web-developer", "high")
    await expect(effort).toHaveCSS("color", AMBER_TEXT)

    await developer.click()

    await expect(developer).toHaveAttribute("aria-pressed", "false")
    // Kept, not reset — the choice survives the agent going quiet.
    await expect(effort).toHaveText("high")
    await expect(effort).toHaveCSS("color", RECESSED_WORD)
  })

  test("choosing an effort does not switch the agent on", async ({
    configure,
  }) => {
    const developer = configure.roster.agentButton("web", "developer")

    await configure.roster.setEffort("web-developer", "high")

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
    await expect(configure.roster.effortWord("web-developer")).toBeVisible()
  })
})

// Nothing on the right edge of a skill row may compete with the effort word
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

// The panel header stopped being a bare word and became the third hinge: the
// same 10px tracked label the two in the main column use, with a rule running
// to the panel edge. What it must NOT take from them is the 60px leading stub
// — the panel has no gutter, and a stub would push the header's first ink 76px
// in against rows locked to 17px.
test.describe("roster header", () => {
  test("names what the panel is grouped by", async ({ configure }) => {
    await expect(configure.roster.heading).toHaveText(HEADER_LABEL)
  })

  // The one declaration a reimplementation drops. Both the label and the
  // control refuse to shrink, so the rule is the only item in the row that
  // can — and with no floor it goes to zero and the treatment vanishes.
  test("carries a rule that never collapses to nothing", async ({
    configure,
  }) => {
    const rule = await configure.roster.headerRule.boundingBox()
    if (!rule) throw new Error("the header rule must be drawn")

    expect(rule.width).toBeGreaterThanOrEqual(MIN_HEADER_RULE_PX)
  })

  // The panel's only alignment rule, and the whole reason the header takes a
  // stubless variant rather than the column one. Asserted as a RELATIONSHIP
  // between two live boxes rather than against a pixel: the header's first ink
  // and the band's first ink are the same edge, at any width and any root
  // font size, and a stub would move one of them by 76px while every
  // visibility and text assertion in this file stayed green.
  test("starts its ink on the same edge the bands do", async ({
    configure,
  }) => {
    const header = await inkStartOf(configure.roster.heading)
    const band = await inkStartOf(configure.roster.bandLabel("web"))

    expect(header).toBeCloseTo(band, 0)
  })
})

// Two bandings, one renderer. The rows, their three words, their skills and
// the where-used tooltip are identical between the modes; what changes is
// which band an agent falls into, what that band is called, and whether the
// row has to name its own domain.
test.describe("roster grouping", () => {
  // The visible text is the current VALUE, which is why the control is located
  // by an aria-label instead: `domain` names no action. The caret beside it is
  // a drawn glyph rather than U+25BE now — one icon set, one geometry — and a
  // drawn glyph contributes no text, so these are the bare words.
  const AT_DOMAIN = "domain"
  const AT_SCOPE = "scope"
  // Scope mode moves the domain off the band and onto the row.
  const PREFIXED_DEVELOPER = "web · developer"
  const BARE_DEVELOPER = "developer"

  test("rests on domain, with the domain bands on screen", async ({
    configure,
  }) => {
    await expect(configure.roster.groupControl).toHaveText(AT_DOMAIN)
    await expect(configure.roster.domainBand("web")).toBeVisible()
    await expect(configure.roster.scopeBand("global")).toHaveCount(0)
  })

  test("picking scope replaces the domain bands with the two destinations", async ({
    configure,
  }) => {
    await configure.roster.setScope("web-developer", "project")

    await configure.roster.groupBy("scope")

    await expect(configure.roster.groupControl).toHaveText(AT_SCOPE)
    await expect(configure.roster.scopeBand("global")).toContainText(
      GLOBAL_PATH
    )
    await expect(configure.roster.scopeBand("project")).toContainText(
      PROJECT_PATH
    )
    await expect(configure.roster.domainBand("web")).toHaveCount(0)
  })

  // A destination nobody writes to is not drawn empty; it is not drawn. This
  // is the state every visitor opens on, so it is the common case rather than
  // an edge one.
  test("draws only the destination that has agents", async ({ configure }) => {
    await configure.roster.groupBy("scope")

    await expect(configure.roster.scopeBand("global")).toBeVisible()
    await expect(configure.roster.scopeBand("project")).toHaveCount(0)
  })

  // Which mode is active is state, so it goes on the accessibility tree
  // rather than into a glyph — the tick is decoration over the top of it.
  test("marks the active mode on the accessibility tree", async ({
    configure,
  }) => {
    await configure.roster.groupControl.click()

    await expect(configure.roster.groupOption("domain")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(configure.roster.groupOption("scope")).toHaveAttribute(
      "aria-checked",
      "false"
    )
  })

  // Both directions, in one test, because the absence half is worthless on
  // its own: the prefixed locator has to be shown reporting the row when the
  // prefix IS there before its silence in domain mode means anything.
  //
  // The bare form is the one asymmetry. Panel-wide it is not a locator at all
  // — four domains field a `developer`, so `agentNamed` resolves to four rows
  // and violates strict mode — so its positive goes through the band, which
  // is the only thing that tells the four apart while the row does not. Its
  // negative below stays panel-wide, and has to: "no row anywhere is called
  // `developer`" is the claim, and a band-scoped version of it would be
  // satisfied by the section having gone away.
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

  // The scope word is the edit target for the banding it is banded by, so the
  // row has to move under it — and the band it leaves disappears when it was
  // that band's last member.
  test("cycling an agent's scope moves its row to the other band", async ({
    configure,
  }) => {
    await configure.roster.groupBy("scope")
    await expect(configure.roster.scopeBand("project")).toHaveCount(0)

    await configure.roster.setScope("web-developer", "project")

    await expect(configure.roster.scopeBand("project")).toBeVisible()
    await expect(configure.roster.scopeBand("project")).toContainText("of 1")
  })

  // One `rosterCollapsed` record serves both modes, and the two key spaces are
  // disjoint by construction — a bare domain id in one, a `scope:` prefix in
  // the other. So neither mode has to reset the other's state, and this test
  // is what fails if the prototype's `shut: {}` reset is ported across.
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
