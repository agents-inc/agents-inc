import type { Locator, Page } from "@playwright/test"

// The `•••` popover. Only one can be open at a time, so this resolves to the
// single visible panel rather than being bound to a particular cell.
//
// Every control inside is a `Chip`, which carries `aria-pressed` — so "is this
// the current value" is an assertion on the accessibility tree rather than on a
// class name.
export class OptionsPanel {
  readonly root: Locator

  constructor(page: Page) {
    this.root = page.getByRole("group", { name: "Skill options" })
  }

  option(value: string): Locator {
    return this.root.getByRole("button", { name: value, exact: true })
  }

  // The mono uppercase captions above each section, in document order — the
  // panel's table of contents, and the cheapest way to assert that model and
  // thinking effort have left it.
  get sectionLabels(): Locator {
    return this.root.locator('[data-slot="field-label"]')
  }

  // The info circle beside a section label, named `About <section>`. A real
  // button like every other affordance in this panel — that is what makes it
  // focusable, so the tip is reachable without a pointer.
  infoGlyph(section: string): Locator {
    return this.root.getByRole("button", { name: `About ${section}` })
  }

  // A cell in the domain × role assignment matrix, e.g. `Web` / `dev`.
  matrixCell(domain: string, role: string): Locator {
    return this.root.getByRole("button", { name: `${domain} ${role}` })
  }

  async choose(value: string) {
    await this.option(value).click()
  }

  // Cycles that sub-agent: unassigned → lazy → preloaded → unassigned.
  async cycleAssignment(domain: string, role: string) {
    await this.matrixCell(domain, role).click()
  }
}
