import type { Locator, Page } from "@playwright/test"

import {
  AddSkillDialog,
  InstallDialog,
  MarketplaceDialog,
  MarketplaceSwitchDialog,
  SkillContentsDialog,
  StackSwitchDialog,
} from "./dialogs"
import { RosterPanel } from "./roster-panel"
import { SkillCell } from "./skill-cell"

const CONFIGURE_URL = "/"

const MARKETPLACE_STORAGE_KEY = "agents-inc:marketplace:v1"

// The SHAPE this release writes, which the `v1` in the key above is not. Seeded
// blobs carry it so a slot written by hand is the one the app would have
// written, and an OLDER number is how a spec asks for a shape that has since
// been migrated.
const MARKETPLACE_PERSIST_VERSION = 2

// The keyed shape before the ref was normalised: its keys are the bare
// `owner/repo` the dialog's field used to store verbatim.
const UNNORMALISED_PERSIST_VERSION = 1

/**
 * What the marketplace slot holds, keyed by marketplace.
 *
 * `current` is which catalogue this browser CHOSE — a third thing again from
 * which one is loaded in the tab — and `saved` is every marketplace it has
 * loaded against the token that reached it, empty for one that needed none.
 */
export type SavedMarketplaces = {
  current: string
  saved: Record<string, string>
}

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
  // The floating button that opens the marketplace dialog. Floating because it
  // belongs to the whole page rather than to any section of it — which
  // marketplace the grid runs on is a statement about everything on screen.
  readonly marketplaceButton: Locator
  // What an arriving share link had to say for itself, above the grid. Scoped
  // to `main` because a dialog's own status line is an alert too, and a parked
  // import shows both at once.
  readonly importNotice: Locator

  readonly roster: RosterPanel
  readonly installDialog: InstallDialog
  readonly addSkillDialog: AddSkillDialog
  readonly skillContentsDialog: SkillContentsDialog
  readonly marketplaceDialog: MarketplaceDialog
  readonly marketplaceSwitchDialog: MarketplaceSwitchDialog
  readonly stackSwitchDialog: StackSwitchDialog
  // The saved marketplaces the visitor is not currently on, offered beside the
  // floating button. Absent entirely until there is more than one to choose
  // between, because a switcher with one entry is furniture.
  readonly marketplaceSwitcher: Locator

  constructor(readonly page: Page) {
    this.stacks = page.getByRole("group", { name: "Stacks" })
    this.searchInput = page.getByLabel("Search skills")
    this.addSkillButton = page.getByRole("button", { name: "＋ Add skill" })
    this.emptyState = page.getByText("No skills match this filter.")
    this.marketplaceButton = page.getByRole("button", { name: "Marketplace" })
    this.importNotice = page.locator("main").getByRole("alert")

    this.roster = new RosterPanel(page)
    this.installDialog = new InstallDialog(page)
    this.addSkillDialog = new AddSkillDialog(page)
    this.skillContentsDialog = new SkillContentsDialog(page)
    this.marketplaceDialog = new MarketplaceDialog(page)
    this.marketplaceSwitchDialog = new MarketplaceSwitchDialog(page)
    this.stackSwitchDialog = new StackSwitchDialog(page)
    this.marketplaceSwitcher = page.getByRole("group", {
      name: "Saved marketplaces",
    })
  }

  // What the browser kept, read back rather than inferred from the screen: the
  // dialog's two fields survive a reload only if they really reached storage.
  //
  // PARSED rather than matched as a string, and that is not tidying. A blob
  // that files the token under the wrong marketplace — or names one marketplace
  // and holds another's credential — still CONTAINS both strings, so
  // `toContain` passes on exactly the reshape this slot exists to make
  // impossible. What is asserted has to be the shape.
  async savedMarketplaces(): Promise<SavedMarketplaces | null> {
    const raw = await this.page.evaluate(
      (key) => window.localStorage.getItem(key),
      MARKETPLACE_STORAGE_KEY
    )
    if (raw === null) return null

    return (JSON.parse(raw) as { state: SavedMarketplaces }).state
  }

  /** Which catalogue this browser chose; `null` when it has saved none. */
  async chosenMarketplace() {
    return (await this.savedMarketplaces())?.current ?? null
  }

  /**
   * The token filed under one marketplace, and `null` when none is.
   *
   * The distinction is the point: `""` is a marketplace saved that needed no
   * token, and `null` is one this browser never saved at all.
   */
  async savedToken(marketplace: string) {
    return (await this.savedMarketplaces())?.saved[marketplace] ?? null
  }

  /** Every marketplace this browser saved, which is what the switcher lists. */
  async savedMarketplaceRefs() {
    const slot = await this.savedMarketplaces()
    return slot === null ? [] : Object.keys(slot.saved)
  }

  /** Seeds the slot as the single-slot release wrote it, version and all. */
  async seedLegacySlot(marketplace: string, token: string) {
    await this.page.evaluate(
      ([key, blob]) => window.localStorage.setItem(key!, blob!),
      [
        MARKETPLACE_STORAGE_KEY,
        JSON.stringify({ state: { marketplace, token }, version: 0 }),
      ]
    )
  }

  /** Seeds the slot in the shape this release writes. */
  async seedSavedMarketplaces(slot: SavedMarketplaces) {
    await this.page.evaluate(
      ([key, blob]) => window.localStorage.setItem(key!, blob!),
      [
        MARKETPLACE_STORAGE_KEY,
        JSON.stringify({
          state: slot,
          version: MARKETPLACE_PERSIST_VERSION,
        }),
      ]
    )
  }

  /** Seeds the keyed slot as it was written before the ref was normalised. */
  async seedUnnormalisedSlot(marketplace: string, token: string) {
    await this.page.evaluate(
      ([key, blob]) => window.localStorage.setItem(key!, blob!),
      [
        MARKETPLACE_STORAGE_KEY,
        JSON.stringify({
          state: { current: marketplace, saved: { [marketplace]: token } },
          version: UNNORMALISED_PERSIST_VERSION,
        }),
      ]
    )
  }

  /** One switcher entry. Asking opens the confirmation, never the switch. */
  switchTo(marketplace: string): Locator {
    return this.marketplaceSwitcher.getByRole("button", {
      name: `Switch to ${marketplace}`,
    })
  }

  // The visitor's own saved selection, read the same way. What is on screen and
  // what is in the slot are two different claims wherever a configuration that
  // is not this browser's is showing — a shared link, or a saved marketplace
  // still waiting on its token — so the slot has to be asked directly.
  async storedConfig() {
    return this.page.evaluate(
      () => window.localStorage.getItem("agents-inc:config:v1") ?? ""
    )
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
