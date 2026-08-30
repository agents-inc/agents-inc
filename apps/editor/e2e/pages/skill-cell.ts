import type { Locator, Page } from "@playwright/test"

import { OptionsPanel } from "./options-panel"

// One skill cell. The badges and the ••• are real controls beside the selection
// target rather than inside it, and the agent count is a label, so all four are
// exposed separately. None of them stops propagation any more — they do not have
// to, now that the target is a sibling rather than their ancestor.
//
// `root` IS THE SELECTION TARGET AND `cell` IS WHAT CONTAINS IT, and they
// stopped being the same element on 2026-08-29. EDITOR-58's `nested-interactive`
// fix made the target an overlay button that is a SIBLING of the cell's content
// rather than its wrapper — a button containing other buttons is unreachable to
// a screen reader, which is the defect that fix closed.
//
// `root` deliberately stayed the button. It is what a spec clicks and what
// carries `aria-pressed`, and sixty-odd assertions say so; a page object exists
// precisely so that a markup change of this shape costs one file rather than
// sixty. What moved is where the INNER controls are found from, which is `cell`
// — reached with `..` from the button rather than by a class, because the button
// is the only element carrying the skill's name and a class is not a contract.
export class SkillCell {
  /** The selection target: what a click hits, and what carries `aria-pressed`. */
  readonly root: Locator
  /** Its container, which every control beside it is found from. */
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

  // The install-mode badge, whose accessible name carries its current value.
  get installBadge(): Locator {
    return this.cell.getByRole("button", { name: /^Install mode: / })
  }

  // The same badge whatever it renders as: a button on a catalogue skill, and a
  // plain statement on an eject-only one, which has no plugin form to flip to.
  // `installBadge` asks for the CONTROL and finds nothing on the second kind;
  // this asks for what a pointer lands on, which is one target either way.
  get installBadgeTarget(): Locator {
    return this.cell.locator('[aria-label^="Install mode: "]')
  }

  get scopeBadge(): Locator {
    return this.cell.getByRole("button", { name: /^Scope: / })
  }

  get optionsButton(): Locator {
    return this.cell.getByRole("button", { name: `Options for ${this.name}` })
  }

  // The `added` tag, which is a button only on a skill that came from outside
  // the catalogue: the provenance marker is the way into what it holds.
  get contentsButton(): Locator {
    return this.cell.getByRole("button", { name: `Contents of ${this.name}` })
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
    return this.cell.getByText(/^(no agents|\d+ agents?)$/)
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
  // Read off the CELL, not the button. The dimming is a property of the whole
  // cell — the overlay button that carries the press is transparent and sits at
  // full opacity whatever the cell does.
  async opacity() {
    return this.cell.evaluate((node) => Number(getComputedStyle(node).opacity))
  }
}
