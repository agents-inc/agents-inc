import type { Locator, Page } from "@playwright/test"

const LATTICE = '[data-slot="lattice"]'
const CELL = '[data-slot="lattice-cell"]'
const CARD_BUTTON = '[data-slot="lattice-cell-button"]'

// In the card's padding, clear of the controls drawn above the overlay.
const PRESS_POINT = { x: 4, y: 4 }

export class SubAgentCards {
  readonly root: Locator
  readonly groups: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole("main")
    this.groups = this.root.getByRole("group", { name: / sub-agents$/ })
  }

  group(label: string): Locator {
    return this.root.getByRole("group", {
      name: `${label} sub-agents`,
      exact: true,
    })
  }

  lattice(groupLabel: string): Locator {
    return this.group(groupLabel).locator(LATTICE)
  }

  // By slot: on Codex the model toggles are buttons too.
  cards(groupLabel: string): Locator {
    return this.lattice(groupLabel).locator(CARD_BUTTON)
  }

  card(groupLabel: string, agentLabel: string): Locator {
    return this.group(groupLabel).getByRole("button", {
      name: agentLabel,
      exact: true,
    })
  }

  cell(groupLabel: string, agentLabel: string): Locator {
    return this.group(groupLabel)
      .locator(CELL)
      .filter({
        has: this.page.getByRole("button", { name: agentLabel, exact: true }),
      })
  }

  // The visible name. The overlay carries the same words as its aria-label,
  // which `getByText` does not read, so this is the drawn span.
  name(groupLabel: string, agentLabel: string): Locator {
    return this.cell(groupLabel, agentLabel).getByText(agentLabel, {
      exact: true,
    })
  }

  effortWord(groupLabel: string, agentLabel: string, level: string): Locator {
    return this.cell(groupLabel, agentLabel).getByText(level, { exact: true })
  }

  // Claude's row. Codex's is `codexModelGroup`.
  modelGroup(agentId: string): Locator {
    return this.root.getByRole("radiogroup", {
      name: `Model for ${agentId}`,
      exact: true,
    })
  }

  // Toggles rather than radios: none pressed is the session's own model.
  codexModelGroup(agentId: string): Locator {
    return this.root.getByRole("group", {
      name: `Model for ${agentId}`,
      exact: true,
    })
  }

  codexModelButton(agentId: string, id: string): Locator {
    return this.codexModelGroup(agentId).getByRole("button", {
      name: id,
      exact: true,
    })
  }

  effortGroup(agentId: string): Locator {
    return this.root.getByRole("radiogroup", {
      name: `Effort for ${agentId}`,
      exact: true,
    })
  }

  scopeGroup(agentId: string): Locator {
    return this.root.getByRole("radiogroup", {
      name: `Scope for ${agentId}`,
      exact: true,
    })
  }

  modelOption(agentId: string, value: string): Locator {
    return this.modelGroup(agentId).getByRole("radio", {
      name: value,
      exact: true,
    })
  }

  effortOption(agentId: string, value: string): Locator {
    return this.effortGroup(agentId).getByRole("radio", {
      name: value,
      exact: true,
    })
  }

  scopeOption(agentId: string, value: string): Locator {
    return this.scopeGroup(agentId).getByRole("radio", {
      name: value,
      exact: true,
    })
  }

  async toggle(
    groupLabel: string,
    agentLabel: string,
    options: { force?: boolean } = {}
  ) {
    await this.card(groupLabel, agentLabel).click({
      position: PRESS_POINT,
      ...options,
    })
  }

  async setModel(agentId: string, value: string) {
    await this.modelOption(agentId, value).click()
  }

  async pressCodexModel(agentId: string, id: string) {
    await this.codexModelButton(agentId, id).click()
  }

  async setEffort(agentId: string, value: string) {
    await this.effortOption(agentId, value).click()
  }

  async setScope(agentId: string, value: string) {
    await this.scopeOption(agentId, value).click()
  }
}
