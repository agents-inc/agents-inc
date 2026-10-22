import type { Locator, Page } from "@playwright/test"

// Specs write these strings out again rather than importing them.
const SCOPE_BAND_TEXT = {
  global: /^~\/\.(claude|codex) · global$/,
  project: /^\.\/\.(claude|codex) · project$/,
} as const

// Sentence case in the DOM, uppercased by CSS.
const ROSTER_HEADER_LABEL = "then assign skills"
const GROUP_BY_CAPTION = "group by"

const LINK_COPIED = "Link copied"

// Step 05, the right rail: bands of agents with their assignments inline, and
// the footer's action row over Install.
export class RosterPanel {
  readonly root: Locator
  readonly header: Locator
  readonly heading: Locator
  readonly headerIndex: Locator
  readonly groupByCaption: Locator
  readonly groupControl: Locator
  readonly installButton: Locator
  readonly shareButton: Locator
  readonly saveButton: Locator
  readonly previewButton: Locator

  constructor(private page: Page) {
    this.root = page.getByRole("complementary")
    this.header = this.root.locator('[data-slot="hinge"]')
    this.heading = this.root.getByText(ROSTER_HEADER_LABEL, { exact: true })
    this.headerIndex = this.header.locator('[data-slot="hinge-index"]')
    this.groupByCaption = this.root.getByText(GROUP_BY_CAPTION, {
      exact: true,
    })
    this.groupControl = this.root.getByRole("radiogroup", {
      name: "Group sub-agents by",
    })
    // Its label carries the counts or the refusal: `Install 4 agents · 1 skill`.
    this.installButton = this.root.getByRole("button", { name: /^Install / })
    this.shareButton = this.root.getByRole("button", { name: "Share" })
    this.saveButton = this.root.getByRole("button", { name: "Save" })
    this.previewButton = this.root.getByRole("button", {
      name: "Preview",
      exact: true,
    })
  }

  // The rail's scrolling box, which holds the header and every band. A class
  // is not a contract, so it is reached from the header.
  get scroller(): Locator {
    return this.header.locator("..")
  }

  get bands(): Locator {
    return this.scroller.locator('[data-slot="roster-band"]')
  }

  groupOption(value: "domain" | "scope"): Locator {
    return this.groupControl.getByRole("radio", { name: value, exact: true })
  }

  // The Share button wearing a narration: the button is the only feedback a
  // share has.
  shareNarrating(label: string): Locator {
    return this.root.getByRole("button", { name: label, exact: true })
  }

  async shareLink() {
    await this.shareButton.click()
    await this.shareNarrating(LINK_COPIED).waitFor()
  }

  // The sticky band, named by its bare label: `web`.
  domainBand(domainId: string): Locator {
    return this.root.getByRole("button", { name: domainId, exact: true })
  }

  // The scope-mode band, named by its destination: `~/.claude · global`.
  scopeBand(scope: keyof typeof SCOPE_BAND_TEXT): Locator {
    return this.root.getByRole("button", { name: SCOPE_BAND_TEXT[scope] })
  }

  // The band's label span — where its ink starts, which the band's own box
  // does not say.
  bandLabel(domainId: string): Locator {
    return this.domainBand(domainId).locator("span").first()
  }

  // The band's `−` / `+`: `data-glyph` names which.
  bandGlyph(domainId: string): Locator {
    return this.domainBand(domainId).locator('[data-slot="glyph"]')
  }

  domainSection(domainId: string): Locator {
    return this.root.locator("section").filter({
      has: this.page.getByRole("button", { name: domainId, exact: true }),
    })
  }

  scopeSection(scope: keyof typeof SCOPE_BAND_TEXT): Locator {
    return this.root.locator("section").filter({
      has: this.page.getByRole("button", { name: SCOPE_BAND_TEXT[scope] }),
    })
  }

  // The agent's pin — colour-only state, exposed as `aria-pressed`.
  agentButton(domainId: string, role: string): Locator {
    return this.domainSection(domainId).getByRole("button", {
      name: role,
      exact: true,
    })
  }

  // The same pin in scope mode, where the row names its own domain:
  // `web · developer`.
  scopeAgent(scope: keyof typeof SCOPE_BAND_TEXT, name: string): Locator {
    return this.scopeSection(scope).getByRole("button", { name, exact: true })
  }

  // The agent's name row, the box the assignment pulse paints. A semantics-free
  // wrapper, so it is reached by slot.
  agentRow(domainId: string, role: string): Locator {
    return this.domainSection(domainId)
      .locator('[data-slot="agent-row"]')
      .filter({
        has: this.page.getByRole("button", { name: role, exact: true }),
      })
  }

  // A pin by its whole name, band-blind: `web · developer` in scope mode.
  agentNamed(name: string): Locator {
    return this.root.getByRole("button", { name, exact: true })
  }

  // An assignment line's toggle, e.g. "React on web-developer": a button
  // stretched over the line as its sibling, so whatever sits INSIDE the line is
  // found from `skillRowCell`.
  skillRow(skillName: string, agentId: string): Locator {
    return this.root.getByRole("button", {
      name: `${skillName} on ${agentId}`,
    })
  }

  // Every row this skill has, which is how many sub-agents carry it.
  skillRowsFor(skillName: string): Locator {
    return this.root.getByRole("button", {
      name: new RegExp(`^${skillName} on `),
    })
  }

  // Every row one sub-agent holds, live or switched off.
  skillRowsOn(agentId: string): Locator {
    return this.root.getByRole("button", {
      name: new RegExp(` on ${agentId}$`),
    })
  }

  liveSkillRowsOn(agentId: string): Locator {
    return this.skillRowsOn(agentId).and(
      this.page.locator('[aria-pressed="true"]')
    )
  }

  skillRowCell(skillName: string, agentId: string): Locator {
    return this.skillRow(skillName, agentId).locator("..")
  }

  // The row's `pre` / `lazy` word; its accessible name carries the full state.
  loadWord(skillName: string, agentId: string): Locator {
    return this.skillRowCell(skillName, agentId).getByRole("button", {
      name: /^Load mode:/,
    })
  }

  // The marker on a row whose two scopes cannot meet; its name is the reason.
  scopeError(skillName: string, agentId: string): Locator {
    return this.skillRowCell(skillName, agentId).getByRole("button", {
      name: /must be set to project scope/,
    })
  }

  // The count button beside the where-used list.
  whereUsedCount(skillName: string, agentId: string): Locator {
    return this.skillRowCell(skillName, agentId).getByRole("button", {
      name: /^Used by /,
    })
  }

  get whereUsedTip(): Locator {
    return this.page.getByRole("tooltip")
  }

  // Hovering anywhere on the row opens the where-used list.
  async whereUsed(skillName: string, agentId: string) {
    await this.skillRow(skillName, agentId).hover()
    return this.whereUsedTip
  }

  async toggleDomain(domainId: string) {
    await this.domainBand(domainId).click()
  }

  async groupBy(value: "domain" | "scope") {
    await this.groupOption(value).click()
  }
}
