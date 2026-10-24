import type { Locator, Page } from "@playwright/test"

// The panel follows its cell's own pairs in the tab order, a few stops on.
const TAB_STOPS_TO_THE_PANEL = 8

// The single open `•••` panel. Exclusive rows are radios (`aria-checked`);
// sub-agent chips are toggles (`aria-pressed`).
export class OptionsPanel {
  readonly root: Locator
  /** Empty unless the keyboard is on one of the panel's own controls. */
  readonly focused: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole("group", { name: "Skill options" })
    this.focused = this.root.locator(":focus")
  }

  // Stops on arrival, so a spec asserts `focused` to learn whether it got in.
  async tabIn() {
    for (let stop = 0; stop < TAB_STOPS_TO_THE_PANEL; stop++) {
      await this.page.keyboard.press("Tab")
      if ((await this.focused.count()) > 0) return
    }
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
