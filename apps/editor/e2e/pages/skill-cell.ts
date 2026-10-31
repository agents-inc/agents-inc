import type { Locator, Page } from "@playwright/test"

import { OptionsPanel } from "./options-panel"

const INSTALL_MODES = ["plugin", "eject"] as const

const SCOPES = ["project", "global"] as const

// `root` is the selection overlay, a sibling of the cell's controls. `cell` is
// its container, reached with `..` because a class is not a contract.
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

  // Every cell of both pairs, by name: an open options panel inside the cell
  // holds radios of its own.
  get switches(): Locator[] {
    return [
      ...INSTALL_MODES.map((mode) => this.installCell(mode)),
      ...SCOPES.map((scope) => this.scopeCell(scope)),
    ]
  }

  // The cells of both pairs that are not on.
  get offSwitches(): Locator {
    return this.installGroup
      .locator('[aria-checked="false"]')
      .or(this.scopeGroup.locator('[aria-checked="false"]'))
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

  // What the pointer can change on the •••: its own paint and its dots'.
  // Opacity is left out, since revealing it is the cell's hover, not its own.
  async optionsPaint() {
    return this.optionsButton.evaluate((node) => {
      const style = getComputedStyle(node)
      const dot = node.firstElementChild
      return {
        background: style.backgroundColor,
        cursor: style.cursor,
        dots: dot ? getComputedStyle(dot).backgroundColor : undefined,
      }
    })
  }

  // The pointer on the cell itself, clear of the •••, which that reveals.
  async hover() {
    await this.root.hover()
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
