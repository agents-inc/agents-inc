import type { Locator, Page } from "@playwright/test"

import { OptionsPanel } from "./options-panel"

// One skill cell. `root` is the selection target — an overlay button that is a
// SIBLING of the cell's controls (EDITOR-58), carrying the name and
// `aria-pressed`. `cell` is its container, reached with `..` because a class is
// not a contract, and every inner control is found from it.
export class SkillCell {
  readonly root: Locator
  readonly cell: Locator
  readonly options: OptionsPanel

  constructor(
    private readonly page: Page,
    readonly name: string,
    scope: Locator | Page = page
  ) {
    this.root = scope.getByRole("button", { name, exact: true })
    this.cell = this.root.locator("..")
    this.options = new OptionsPanel(page)
  }

  get installGroup(): Locator {
    return this.cell.getByRole("radiogroup", { name: "Install mode" })
  }

  get scopeGroup(): Locator {
    return this.cell.getByRole("radiogroup", { name: "Scope" })
  }

  // The checked cell of the pair, or the plain statement an eject-only skill
  // draws in its place.
  get installMode(): Locator {
    return this.cell.locator(
      '[aria-label="Install mode"] [aria-checked="true"], [aria-label^="Install mode: "]'
    )
  }

  get scope(): Locator {
    return this.scopeGroup.locator('[aria-checked="true"]')
  }

  installCell(mode: string): Locator {
    return this.installGroup.getByRole("radio", { name: mode, exact: true })
  }

  scopeCell(scope: string): Locator {
    return this.scopeGroup.getByRole("radio", { name: scope, exact: true })
  }

  async setInstallMode(mode: string) {
    await this.installCell(mode).click()
  }

  async setScope(scope: string) {
    await this.scopeCell(scope).click()
  }

  // Codex's mark on a selected plugin+project skill, and the reason it opens.
  get errorMark(): Locator {
    return this.cell.getByRole("button", {
      name: /codex has no project-level plugins/i,
    })
  }

  get errorTip(): Locator {
    return this.cell.getByText(
      /Codex has no project-level plugins\. Eject this skill to keep it in the project, or install the plugin globally\./
    )
  }

  get optionsButton(): Locator {
    return this.cell.getByRole("button", { name: `Options for ${this.name}` })
  }

  // The `added` tag, a button only on a skill from outside the catalogue.
  get contentsButton(): Locator {
    return this.cell.getByRole("button", { name: `Contents of ${this.name}` })
  }

  async openContents() {
    await this.contentsButton.click()
  }

  // The ••• is revealed by opacity, so that is where shown/hidden lives.
  async optionsOpacity() {
    return this.optionsButton.evaluate((node) =>
      Number(getComputedStyle(node).opacity)
    )
  }

  async toggle() {
    await this.root.click()
  }

  async openOptions() {
    await this.optionsButton.click()
  }

  // Presses whichever cell of the pair is not on. A spec that cares which value
  // it lands on uses `setInstallMode` / `setScope`.
  async flipInstall() {
    await this.installGroup.locator('[aria-checked="false"]').click()
  }

  async flipScope() {
    await this.scopeGroup.locator('[aria-checked="false"]').click()
  }

  async isSelected() {
    return (await this.root.getAttribute("aria-pressed")) === "true"
  }

  // Ruled out by the selection: `aria-disabled`, with the reason as `title`.
  async isIncompatible() {
    return (await this.root.getAttribute("aria-disabled")) === "true"
  }

  async incompatibleReason() {
    return this.root.getAttribute("title")
  }

  // A ruled-out cell recedes to the column colour. Read off the cell, not the
  // overlay button, which is transparent whatever the cell does.
  async background() {
    return this.cell.evaluate((node) => getComputedStyle(node).backgroundColor)
  }
}
