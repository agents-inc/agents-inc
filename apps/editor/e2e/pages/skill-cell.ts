import type { Locator, Page } from "@playwright/test"

import { OptionsPanel } from "./options-panel"

// One skill cell. The cell itself is the selection target; the badges, the
// agent count and the ••• each stop propagation and do their own thing, so all
// four are exposed separately.
export class SkillCell {
  readonly root: Locator
  readonly options: OptionsPanel

  constructor(
    private readonly page: Page,
    readonly name: string,
    scope: Locator | Page = page
  ) {
    this.root = scope.getByRole("button", { name, exact: true })
    this.options = new OptionsPanel(page)
  }

  // The install-mode badge, whose accessible name carries its current value.
  get installBadge(): Locator {
    return this.root.getByRole("button", { name: /^Install mode: / })
  }

  // The same badge whatever it renders as: a button on a catalogue skill, and a
  // plain statement on an eject-only one, which has no plugin form to flip to.
  // `installBadge` asks for the CONTROL and finds nothing on the second kind;
  // this asks for what a pointer lands on, which is one target either way.
  get installBadgeTarget(): Locator {
    return this.root.locator('[aria-label^="Install mode: "]')
  }

  get scopeBadge(): Locator {
    return this.root.getByRole("button", { name: /^Scope: / })
  }

  get optionsButton(): Locator {
    return this.root.getByRole("button", { name: `Options for ${this.name}` })
  }

  // The `added` tag, which is a button only on a skill that came from outside
  // the catalogue: the provenance marker is the way into what it holds.
  get contentsButton(): Locator {
    return this.root.getByRole("button", { name: `Contents of ${this.name}` })
  }

  async openContents() {
    await this.contentsButton.click()
  }

  // The ••• is revealed by opacity rather than mounted on hover, so that is
  // where its shown/hidden state lives.
  async optionsOpacity() {
    return this.optionsButton.evaluate((node) =>
      Number(getComputedStyle(node).opacity)
    )
  }

  // Only rendered on selected skills, and a label rather than a control — the
  // ••• is the only way into the options panel.
  get agentCount(): Locator {
    return this.root.getByText(/^(no agents|\d+ agents?)$/)
  }

  async toggle() {
    await this.root.click()
  }

  async openOptions() {
    await this.optionsButton.click()
  }

  async flipInstall() {
    await this.installBadge.click()
  }

  async flipScope() {
    await this.scopeBadge.click()
  }

  async isSelected() {
    return (await this.root.getAttribute("aria-pressed")) === "true"
  }

  // Ruled out by the current selection: announced via `aria-disabled`, with
  // the reason as the cell's accessible description (`title`).
  async isIncompatible() {
    return (await this.root.getAttribute("aria-disabled")) === "true"
  }

  async incompatibleReason() {
    return this.root.getAttribute("title")
  }

  // Dimming is the whole visual signal for a ruled-out cell, so it is worth
  // pinning: without it the cell looks live but is dead to every click.
  async opacity() {
    return this.root.evaluate((node) => Number(getComputedStyle(node).opacity))
  }
}
