import type { Locator, Page } from "@playwright/test"

// What will be written, then the commands that write it. No install action.
export class InstallDialog {
  readonly root: Locator
  readonly skillsPane: Locator
  readonly agentsPane: Locator
  readonly footerNote: Locator
  // The footer action. Shares its accessible name with the header ✕.
  readonly closeButton: Locator
  // The header ✕.
  readonly dismissButton: Locator

  constructor(page: Page) {
    this.root = page.getByRole("dialog").filter({ hasText: "INSTALL" })
    this.skillsPane = this.root.locator('[data-slot="dialog-pane"]').first()
    this.agentsPane = this.root.locator('[data-slot="dialog-pane"]').last()
    this.footerNote = this.root.locator('[data-slot="dialog-footer-note"]')
    this.closeButton = this.root
      .locator('[data-slot="dialog-footer"]')
      .getByRole("button", { name: "Close" })
    this.dismissButton = this.root
      .locator('[data-slot="dialog-header"]')
      .getByRole("button", { name: "Close" })
  }

  command(text: string): Locator {
    return this.root.locator('[data-slot="command-block"]', { hasText: text })
  }

  async close() {
    await this.closeButton.click()
  }
}

// The external skill index, filtered in the browser, staged into pills and
// committed together.
export class AddSkillDialog {
  readonly root: Locator
  readonly searchInput: Locator
  readonly footerNote: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    this.root = page.getByRole("dialog").filter({ hasText: "ADD SKILL" })
    this.searchInput = this.root.getByLabel("Search external skills")
    this.footerNote = this.root.locator('[data-slot="dialog-footer-note"]')
    this.cancelButton = this.root.getByRole("button", { name: "Cancel" })
  }

  // Result rows are the add-skill lattice; the skill's own name identifies one.
  result(name: string): Locator {
    return this.root
      .locator('[data-slot="lattice-row"]')
      .filter({ hasText: name })
  }

  stagedPill(skillName: string): Locator {
    return this.root.locator("span").filter({ hasText: skillName }).first()
  }

  get confirmButton(): Locator {
    return this.root.getByRole("button", { name: /^Add \d+ skills?$/ })
  }

  async search(term: string) {
    await this.searchInput.fill(term)
  }

  async stage(fullName: string) {
    await this.result(fullName).click()
  }

  async confirm() {
    await this.confirmButton.click()
  }

  async cancel() {
    await this.cancelButton.click()
  }
}

// Only reached once the configuration has actually been edited.
export class StackSwitchDialog {
  readonly root: Locator
  readonly confirmButton: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    this.root = page.getByRole("alertdialog")
    this.confirmButton = this.root.getByRole("button", { name: "Switch" })
    this.cancelButton = this.root.getByRole("button", {
      name: "Keep my setup",
    })
  }

  async confirm() {
    await this.confirmButton.click()
  }

  async cancel() {
    await this.cancelButton.click()
  }
}
