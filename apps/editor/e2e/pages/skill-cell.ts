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

  // THE TWO PAIRS, AND THE CELL EACH IS RESTING ON. Every value has been on
  // screen since the 2026-09-06 refresh, so "what is the install mode" is no
  // longer a question about one control's accessible name — it is which of the
  // pair's cells is checked, which is what `installMode` reads.
  //
  // Scoped to the group rather than to the cell, because `plugin` and `project`
  // are two radios in one skill cell and a bare `getByRole("radio")` there
  // cannot say which pair it found.
  get installGroup(): Locator {
    return this.cell.getByRole("radiogroup", { name: "Install mode" })
  }

  get scopeGroup(): Locator {
    return this.cell.getByRole("radiogroup", { name: "Scope" })
  }

  // The install mode this skill is on, whatever the pair renders as: the
  // checked cell on a catalogue skill, and a plain statement on an eject-only
  // one, which has no plugin form and so is not a choice at all. One locator
  // for both, because every spec asking this is asking the same question.
  get installMode(): Locator {
    return this.cell.locator(
      '[aria-label="Install mode"] [aria-checked="true"], [aria-label^="Install mode: "]'
    )
  }

  get scope(): Locator {
    return this.scopeGroup.locator('[aria-checked="true"]')
  }

  // One cell of a pair, by the value it sets. This is how a choice is MADE now
  // — a click on the value you want rather than a click that cycles to it.
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

  async toggle() {
    await this.root.click()
  }

  async openOptions() {
    await this.optionsButton.click()
  }

  // MOVE THE VALUE, WITHOUT NAMING THE ONE IT MOVES TO. There is no flip on
  // screen any more — the pair is picked from directly — so this presses
  // whichever cell is not currently on, which is what every spec that only
  // needs the value CHANGED was asking for when it said "flip".
  //
  // A spec that cares WHICH value it lands on says so with `setInstallMode` /
  // `setScope` instead, and several now do.
  async flipInstall() {
    await this.installGroup.locator('[aria-checked="false"]').click()
  }

  async flipScope() {
    await this.scopeGroup.locator('[aria-checked="false"]').click()
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

  // RECEDING is the whole visual signal for a ruled-out cell: it stops being
  // white and drops to the colour of the column it sits on. It was a 40% fade,
  // which is rejected by name — the fade took the cell's own hairlines with it,
  // so the lattice broke and it read as a rendering fault rather than a state.
  //
  // Read off the CELL, not the button: the overlay button that carries the
  // press is transparent whatever the cell does.
  async background() {
    return this.cell.evaluate((node) => getComputedStyle(node).backgroundColor)
  }
}
