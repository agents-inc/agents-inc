import type { Locator, Page } from "@playwright/test"

import { AddSkillDialog, InstallDialog, StackSwitchDialog } from "./dialogs"
import { RosterPanel } from "./roster-panel"
import { SkillCell } from "./skill-cell"

const CONFIGURE_URL = "/"

// Every skill cell on the screen. The filter bar sits outside every section,
// so nothing on the bar can ever match this.
const SKILL_CELL = 'main section [data-slot="lattice-cell"]'

// How far the keyboard may walk looking for the pin. Reaching it takes around
// seventy stops from the bar; this is headroom, and a walk that spends it all
// leaves the bar unstuck for the spec to fail on.
const MAX_TAB_STEPS = 200

// The saved snapshot's cell. The app names this one rather than the generated
// catalogue, so it lives here beside the grid rather than in
// `support/catalog.ts` — no amount of catalog drift can move it.
export const SAVED_STACK = "Saved stack"

// The Configure screen. Composed of smaller objects rather than holding every
// locator itself — a skill cell and the options panel each have enough surface
// to be worth their own file.
//
// Scoping goes through landmarks (`group`, `region`) rather than CSS, so a
// class rename cannot break the suite and the locators double as a check that
// the page is navigable.
export class ConfigurePage {
  readonly stacks: Locator
  readonly searchInput: Locator
  readonly addSkillButton: Locator
  readonly emptyState: Locator

  readonly roster: RosterPanel
  readonly installDialog: InstallDialog
  readonly addSkillDialog: AddSkillDialog
  readonly stackSwitchDialog: StackSwitchDialog

  constructor(readonly page: Page) {
    this.stacks = page.getByRole("group", { name: "Stacks" })
    this.searchInput = page.getByLabel("Search skills")
    this.addSkillButton = page.getByRole("button", { name: "＋ Add skill" })
    this.emptyState = page.getByText("No skills match this filter.")

    this.roster = new RosterPanel(page)
    this.installDialog = new InstallDialog(page)
    this.addSkillDialog = new AddSkillDialog(page)
    this.stackSwitchDialog = new StackSwitchDialog(page)
  }

  async goto() {
    await this.page.goto(CONFIGURE_URL)
    await this.stacks.waitFor()
    // Wait for the skill grids too, not just the stacks. They are what makes
    // the page taller than the viewport, so scrolling before they exist
    // silently lands somewhere other than where the test asked for.
    await this.skillCells.first().waitFor()
    // And for webfonts: the design is set in Inter and IBM Plex Mono at a
    // dozen sizes, so a late swap reflows the page under a test that has
    // already scrolled.
    await this.page.evaluate(() => document.fonts.ready)
  }

  // ── Stacks ─────────────────────────────────────────────────────────────

  stack(name: string): Locator {
    return this.stacks.getByRole("button", { name, exact: true })
  }

  async chooseStack(name: string) {
    await this.stack(name).click()
  }

  // The saved snapshot behaves like a stack, so it is located like one.
  get savedStack(): Locator {
    return this.stack(SAVED_STACK)
  }

  // Where a cell sits is part of the contract for the saved snapshot — it takes
  // the slot straight after scratch — so cells are reachable by position as
  // well as by name.
  stackCell(index: number): Locator {
    return this.stacks.locator('[data-slot="lattice-cell"]').nth(index)
  }

  // The labelled section dividers. The second carries the instructional copy.
  hinge(label: string): Locator {
    return this.page.locator('[data-slot="hinge"]').filter({ hasText: label })
  }

  // ── Filters ────────────────────────────────────────────────────────────

  chip(name: string): Locator {
    return this.page.getByRole("button", { name, exact: true })
  }

  // The bar's own full-bleed wrapper — the element that sticks, and the one
  // that takes the dark band once it does. Reached up from the search input
  // rather than by class, the same way `domainHeader` reaches its row.
  get filterBar(): Locator {
    return this.searchInput.locator("../../..")
  }

  async search(term: string) {
    await this.searchInput.fill(term)
  }

  async toggleChip(name: string) {
    await this.chip(name).click()
  }

  // ── Skills ─────────────────────────────────────────────────────────────

  domain(label: string): Locator {
    return this.page.getByRole("region", { name: `${label} skills` })
  }

  // The sticky header row; carries `data-pinned` while it holds the top.
  domainHeader(label: string): Locator {
    return this.domain(label)
      .getByRole("heading", { name: label })
      .locator("..")
  }

  category(domainLabel: string, categoryName: string): Locator {
    return this.domain(domainLabel).getByRole("group", {
      name: categoryName,
      exact: true,
    })
  }

  // Scope to a category when a skill name might repeat across domains.
  skill(name: string, scope?: Locator): SkillCell {
    return new SkillCell(this.page, name, scope)
  }

  // The common case: a named skill inside a named category of a domain.
  skillIn(domainLabel: string, categoryName: string, name: string): SkillCell {
    return this.skill(name, this.category(domainLabel, categoryName))
  }

  // Every rendered skill cell, for counting what a filter left behind.
  get skillCells(): Locator {
    return this.page.locator(SKILL_CELL)
  }

  // The cell holding the caret — the cell itself, or one of the controls
  // inside it. Empty whenever focus is anywhere else, the filter bar included.
  get focusedSkillCell(): Locator {
    return this.page.locator(`${SKILL_CELL}:focus-within`)
  }

  // ── Scroll ─────────────────────────────────────────────────────────────

  async scrollTo(y: number) {
    await this.page.evaluate((value) => window.scrollTo(0, value), y)
  }

  async scrollY() {
    return this.page.evaluate(() => window.scrollY)
  }

  // True once the filter bar has reached the top and changed shape.
  async isBarStuck() {
    return this.page.evaluate(() =>
      document.documentElement.hasAttribute("data-bar-stuck")
    )
  }

  // Walks the keyboard down the page one control at a time. Each Tab that
  // reaches a control the viewport is not showing scrolls it into view, and
  // one of those scrolls crosses the pin — which is how a keyboard user
  // sticks the bar without ever asking to scroll.
  async tabUntilBarSticks() {
    for (let step = 0; step < MAX_TAB_STEPS; step++) {
      if (await this.isBarStuck()) return
      await this.page.keyboard.press("Tab")
    }
  }
}
