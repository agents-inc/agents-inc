import type { Locator, Page } from "@playwright/test"

// The single open `•••` panel. Exclusive rows are radios (`aria-checked`);
// sub-agent chips are toggles (`aria-pressed`).
export class OptionsPanel {
  readonly root: Locator

  constructor(page: Page) {
    this.root = page.getByRole("group", { name: "Skill options" })
  }

  // One option in an exclusive row — plugin/eject, project/global.
  segment(value: string): Locator {
    return this.root.getByRole("radio", { name: value, exact: true })
  }

  option(value: string): Locator {
    return this.root.getByRole("button", { name: value, exact: true })
  }

  get sectionLabels(): Locator {
    return this.root.locator('[data-slot="field-label"]')
  }

  // A real button, so the tip is reachable without a pointer.
  infoGlyph(section: string): Locator {
    return this.root.getByRole("button", { name: `About ${section}` })
  }

  // A cell in the domain × role assignment matrix, e.g. `Web` / `dev`.
  matrixCell(domain: string, role: string): Locator {
    return this.root.getByRole("button", { name: `${domain} ${role}` })
  }

  get sourceLink(): Locator {
    return this.root.getByRole("link", { name: "Source code" })
  }

  async choose(value: string) {
    await this.segment(value).click()
  }

  // Cycles that sub-agent: unassigned → lazy → preloaded → unassigned.
  async cycleAssignment(domain: string, role: string) {
    await this.matrixCell(domain, role).click()
  }
}
