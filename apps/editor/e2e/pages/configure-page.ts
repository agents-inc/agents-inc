import type { Locator, Page } from "@playwright/test"

import { Composer } from "./composer"
import {
  AddSkillDialog,
  InstallDialog,
  MarketplaceDialog,
  MarketplaceSwitchDialog,
  OutputPreviewDialog,
  SaveStackDialog,
  SkillContentsDialog,
  StackSwitchDialog,
} from "./dialogs"
import { OptionsPanel } from "./options-panel"
import { ProviderControl } from "./provider-control"
import { RosterPanel } from "./roster-panel"
import { SkillCell } from "./skill-cell"
import { SubAgentCards } from "./sub-agent-cards"

const CONFIGURE_URL = "/"

const MARKETPLACE_STORAGE_KEY = "agents-inc:marketplace:v1"

const UI_STORAGE_KEY = "agents-inc:ui:v1"

const CONFIG_STORAGE_KEY = "agents-inc:config:v1"

const SAVED_STACK_STORAGE_KEY = "agents-inc:saved-stack:v1"

// The persist version this release writes; the key's `v1` is not it.
const MARKETPLACE_PERSIST_VERSION = 2

// The keyed shape before the ref was normalised: its keys are the bare
// `owner/repo` the dialog's field used to store verbatim.
const UNNORMALISED_PERSIST_VERSION = 1

/**
 * `current` is the catalogue this browser chose, not necessarily the one loaded
 * in the tab. `saved` maps each loaded marketplace to its token, empty when it
 * needed none.
 */
export type SavedMarketplaces = {
  current: string
  saved: Record<string, string>
}

/** The arrangement slot, as `ui-store` persists it. */
export type StoredUi = {
  rosterCollapsed: Record<string, boolean>
  rosterGroupBy: string
  providerCollapsed: boolean
  stackCollapsed: boolean
  agentsCollapsed: boolean
}

// The frame the observer reports in, the one its deferred write lands in, and
// one to read the page after.
const FRAMES_UNTIL_A_DEFERRED_WRITE_IS_LAID_OUT = 3

// Every skill cell. Nothing on the filter bar can match it.
const SKILL_CELL = 'main section [data-slot="lattice-cell"]'

// A category's grid, read for its track count.
const LATTICE = '[data-slot="lattice"]'

const MARKETPLACE_SECTION = '[data-slot="marketplace-row"]'

// Far enough past the bar's own top that it has pinned and changed shape.
const PAST_THE_PIN = 400

// Headroom for the keyboard walk to the pin. A walk that spends it all leaves
// the bar unstuck for the spec to fail on.
const MAX_TAB_STEPS = 200

/**
 * The focused control, named, and how far `cover` hides it or its `ring-1`
 * focus ring (drawn a pixel outside its box) — or `null`. A control inside the
 * cover is never hidden by it. Runs in the page.
 */
const focusCoveredBy = (cover: HTMLElement) => {
  const focused = document.activeElement
  if (!(focused instanceof HTMLElement) || cover.contains(focused)) return null

  const ring = 1
  const control = focused.getBoundingClientRect()
  const over = cover.getBoundingClientRect()
  const across =
    Math.min(control.right + ring, over.right) -
    Math.max(control.left - ring, over.left)
  const down =
    Math.min(control.bottom + ring, over.bottom) -
    Math.max(control.top - ring, over.top)
  if (across <= 0 || down <= 0) return null

  const name = focused.getAttribute("aria-label") ?? focused.innerText
  return `${name} by ${down.toFixed(1)}px`
}

// The retired single slot's cell name.
export const SAVED_STACK = "Saved stack"

// Scoped through landmarks rather than CSS, so a class rename cannot break the
// suite and the locators double as a check that the page is navigable.
export class ConfigurePage {
  readonly stacks: Locator
  readonly searchInput: Locator
  // The bordered box the search input sits in, and the box the `all | selected`
  // pair is asserted against.
  readonly searchField: Locator
  readonly addSkillButton: Locator
  // The sticky wrapper that pins, and the band inside it that goes dark.
  readonly filterBar: Locator
  readonly filterBand: Locator
  // The domain strip under the band: one tab per domain in the catalogue,
  // scoped as a group, because a bare `button` under the bar would still match
  // the add-skill block above it.
  readonly domainTabs: Locator
  // The `all 42 | selected 14` pair, drawn only once something is selected.
  // By the group's name, which is fixed while the cells' counts move. Page
  // wide, because where it sits is a claim of its own.
  readonly selectedFilter: Locator
  readonly emptyState: Locator
  // A substring match: the name carries the catalogue as well as the word.
  readonly marketplaceButton: Locator
  // By slot, so the row can be measured whichever face it is wearing.
  readonly marketplaceSection: Locator
  // The same node through the navigation landmark: "inside the rail" is a
  // claim of its own.
  readonly railMarketplaceSection: Locator
  // Scoped to `main` because a dialog's status line is an alert too.
  readonly importNotice: Locator
  // By slot: it is an alert inside `main`, as `importNotice` is.
  readonly adoptionNotice: Locator

  readonly roster: RosterPanel
  readonly provider: ProviderControl
  readonly subAgents: SubAgentCards
  readonly composer: Composer
  readonly installDialog: InstallDialog
  readonly addSkillDialog: AddSkillDialog
  readonly skillContentsDialog: SkillContentsDialog
  readonly outputPreviewDialog: OutputPreviewDialog
  readonly marketplaceDialog: MarketplaceDialog
  readonly marketplaceSwitchDialog: MarketplaceSwitchDialog
  readonly stackSwitchDialog: StackSwitchDialog
  readonly saveStackDialog: SaveStackDialog
  // The saved marketplaces the visitor is not on. Absent until there are two.
  readonly marketplaceSwitcher: Locator
  // Not by the person's name, which is data.
  readonly signInButton: Locator
  readonly signOutButton: Locator
  readonly accountName: Locator
  // By slot, so the row can be measured whichever face it is wearing.
  readonly accountRow: Locator
  // Its accessible name is the action rather than the state.
  readonly themeToggle: Locator
  readonly githubLink: Locator
  // Scoped to the `nav`, because `importNotice` is an alert too.
  readonly accountNotice: Locator
  readonly editorLink: Locator
  // Sticky and one screen tall, so its top edge is where the frame sits.
  readonly navRail: Locator
  // Whichever skill's ••• panel is open; only one can be.
  readonly skillOptions: OptionsPanel

  constructor(readonly page: Page) {
    this.stacks = page.getByRole("group", { name: "Stacks" })
    this.searchInput = page.getByLabel("Search skills")
    this.searchField = page.locator('[data-slot="search-field"]')
    this.addSkillButton = page.getByRole("button", { name: "Add skill" })
    this.filterBar = page.locator('[data-slot="filter-bar"]')
    this.filterBand = page.locator('[data-slot="filter-band"]')
    this.domainTabs = page.getByRole("group", { name: "Domains" })
    this.selectedFilter = page.getByRole("radiogroup", {
      name: "Show only selected skills",
    })
    this.emptyState = page.getByText("No skills match this filter.")
    this.marketplaceButton = page.getByRole("button", { name: "Marketplace" })
    this.marketplaceSection = page.locator(MARKETPLACE_SECTION)
    this.railMarketplaceSection = page
      .getByRole("navigation")
      .locator(MARKETPLACE_SECTION)
    this.importNotice = page.locator("main").getByRole("alert")
    this.adoptionNotice = page.locator('[data-slot="adoption-notice"]')

    this.roster = new RosterPanel(page)
    this.provider = new ProviderControl(page)
    this.subAgents = new SubAgentCards(page)
    this.composer = new Composer(page)
    this.installDialog = new InstallDialog(page)
    this.addSkillDialog = new AddSkillDialog(page)
    this.skillContentsDialog = new SkillContentsDialog(page)
    this.outputPreviewDialog = new OutputPreviewDialog(page)
    this.marketplaceDialog = new MarketplaceDialog(page)
    this.marketplaceSwitchDialog = new MarketplaceSwitchDialog(page)
    this.stackSwitchDialog = new StackSwitchDialog(page)
    this.saveStackDialog = new SaveStackDialog(page)
    this.marketplaceSwitcher = page.getByRole("group", {
      name: "Saved marketplaces",
    })
    this.signInButton = page.getByRole("button", { name: "Sign in" })
    this.signOutButton = page.getByRole("button", { name: "Sign out" })
    this.accountName = page.locator('[data-slot="account-name"]')
    this.accountRow = page.locator('[data-slot="account-row"]')
    this.themeToggle = page.locator('[data-slot="theme-toggle"]')
    this.githubLink = page.getByRole("link", { name: "GitHub" })
    this.accountNotice = page.locator("nav").getByRole("alert")
    this.editorLink = page
      .getByRole("navigation")
      .getByRole("link", { name: "Editor", exact: true })
    this.navRail = page.getByRole("navigation")
    this.skillOptions = new OptionsPanel(page)
  }

  // Parsed rather than matched as a string: a blob filing the token under the
  // wrong marketplace still contains both strings.
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

  /** Seeds the retired single saved-stack slot. */
  async seedSavedStack(payload: unknown) {
    await this.page.evaluate(
      ([key, blob]) => window.localStorage.setItem(key!, blob!),
      [
        SAVED_STACK_STORAGE_KEY,
        JSON.stringify({ state: { saved: payload }, version: 0 }),
      ]
    )
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

  // The visitor's own saved selection, read from the slot because the screen
  // may be showing a configuration that is not this browser's.
  async storedConfig() {
    return this.page.evaluate(
      (key) => window.localStorage.getItem(key) ?? "",
      CONFIG_STORAGE_KEY
    )
  }

  // Parsed, for the reason `savedMarketplaces` is.
  async storedUi(): Promise<StoredUi | null> {
    const raw = await this.page.evaluate(
      (key) => window.localStorage.getItem(key),
      UI_STORAGE_KEY
    )
    if (raw === null) return null

    return (JSON.parse(raw) as { state: StoredUi }).state
  }

  /** Opens the screen at an address naming a domain, as a shared link does. */
  async gotoDomain(domainId: string) {
    await this.goto(`?domain=${domainId}`)
  }

  async goto(search = "") {
    await this.page.goto(`${CONFIGURE_URL}${search}`)
    await this.stacks.waitFor()
    // The grids make the page tall enough to scroll, and a late webfont swap
    // reflows it, so both are waited for before any spec scrolls.
    await this.skillCells.first().waitFor()
    await this.page.evaluate(() => document.fonts.ready)
  }

  stack(name: string): Locator {
    return this.stacks.getByRole("button", { name, exact: true })
  }

  async chooseStack(name: string) {
    await this.stack(name).click()
  }

  // By position: where a cell sits is part of its contract.
  stackCell(index: number): Locator {
    return this.stacks.locator('[data-slot="lattice-cell"]').nth(index)
  }

  // By any part of the hinge's copy.
  hinge(label: string): Locator {
    return this.page.locator('[data-slot="hinge"]').filter({ hasText: label })
  }

  // A step title's fold button, named by its words; the index is `aria-hidden`.
  // A pattern for the 04 title, whose words follow the chosen stack.
  stepTitle(words: string | RegExp): Locator {
    return this.page
      .getByRole("main")
      .getByRole("button", { name: words, exact: true })
  }

  // The box that carries a step title's margins.
  stepHinge(words: string | RegExp): Locator {
    return this.page
      .getByRole("main")
      .locator('[data-slot="hinge"]')
      .filter({
        has: this.page.getByRole("button", { name: words, exact: true }),
      })
  }

  async search(term: string) {
    await this.searchInput.fill(term)
  }

  domain(label: string): Locator {
    return this.page.getByRole("region", { name: `${label} skills` })
  }

  // By its first word. The count is matched rather than pinned because the page
  // derives it.
  selectedFilterCell(word: "all" | "selected"): Locator {
    return this.selectedFilter.getByRole("radio", {
      name: new RegExp(`^${word} \\d+$`),
    })
  }

  get selectedFilterOn(): Locator {
    return this.selectedFilter.locator('[aria-checked="true"]')
  }

  // The tab's count is `aria-hidden`, so its name is the label.
  domainTab(label: string): Locator {
    return this.domainTabs.getByRole("button", { name: label, exact: true })
  }

  // `data-active` is the domain in view.
  get activeDomainTab(): Locator {
    return this.domainTabs.locator("[data-active]")
  }

  // Measured rather than a coordinate, because the grid's height is the
  // generated catalogue's.
  async scrollToDomain(domainId: string) {
    await this.page.evaluate((id) => {
      const anchor = document.querySelector(`[data-domain-anchor="${id}"]`)
      if (!anchor) throw new Error(`no anchor for the ${id} domain`)

      window.scrollTo(0, window.scrollY + anchor.getBoundingClientRect().top)
    }, domainId)
  }

  // How far a domain's top edge sits below the bar's underside. Negative is
  // hidden behind the bar; a large positive means the jump undershot.
  async domainGapUnderBar(domainId: string) {
    return this.page.evaluate((id) => {
      const anchor = document.querySelector(`[data-domain-anchor="${id}"]`)
      const bar = document.querySelector('[data-slot="filter-bar"]')
      if (!anchor || !bar) throw new Error(`no anchor or bar for ${id}`)

      return (
        anchor.getBoundingClientRect().top - bar.getBoundingClientRect().bottom
      )
    }, domainId)
  }

  // `null` is "whatever the OS asked for".
  async theme() {
    return this.page.evaluate(
      () => document.documentElement.dataset.theme ?? null
    )
  }

  // A colour token as the page resolves it now, in `rgb(…)` form. Read through
  // a throwaway element because the root reports a token as declared.
  async tokenColor(token: `--color-${string}`) {
    return this.page.evaluate((name) => {
      const probe = document.createElement("span")
      probe.style.color = `var(${name})`
      document.body.append(probe)
      const resolved = getComputedStyle(probe).color
      probe.remove()
      return resolved
    }, token)
  }

  category(domainLabel: string, categoryName: string): Locator {
    return this.domain(domainLabel).getByRole("group", {
      name: categoryName,
      exact: true,
    })
  }

  skillLattice(domainLabel: string, categoryName: string): Locator {
    return this.category(domainLabel, categoryName).locator(LATTICE)
  }

  // Computed style rather than a class name: what the browser laid out.
  async latticeTracks(lattice: Locator) {
    return lattice.evaluate(
      (node) => getComputedStyle(node).gridTemplateColumns.split(" ").length
    )
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

  // The last cell's •••, where a panel has the least page beneath it.
  async openLastSkillOptions() {
    await this.skillCells
      .last()
      .getByRole("button", { name: /^Options for / })
      .click()
  }

  async scrollTo(y: number) {
    await this.page.evaluate((value) => window.scrollTo(0, value), y)
  }

  async scrollY() {
    return this.page.evaluate(() => window.scrollY)
  }

  // Measured, because the steps above the bar decide where it pins.
  async scrollPastThePin() {
    const pin = await this.filterBar.evaluate(
      (bar) => window.scrollY + bar.getBoundingClientRect().top
    )
    await this.scrollTo(pin + PAST_THE_PIN)
  }

  // Until it stops moving: the bar's band grows as it pins, and the panel room
  // is written a frame after its ResizeObserver reports, so one pass lands
  // short of the bottom.
  async scrollToBottom() {
    let previous = -1
    let landed = 0

    while (landed !== previous) {
      previous = landed
      landed = await this.page.evaluate(async (frames) => {
        window.scrollTo(0, document.documentElement.scrollHeight)
        for (let frame = 0; frame < frames; frame++) {
          await new Promise((resolve) => requestAnimationFrame(resolve))
        }
        return window.scrollY
      }, FRAMES_UNTIL_A_DEFERRED_WRITE_IS_LAID_OUT)
    }
  }

  /**
   * Every stop of a keyboard walk that landed on a control `cover` hides, so a
   * failure prints which controls and by how many pixels.
   *
   * @param key `Tab` puts a control at the bottom edge, `Shift+Tab` at the top.
   */
  async stopsCoveredBy(
    cover: Locator,
    key: "Tab" | "Shift+Tab",
    stops: number
  ) {
    const covered: string[] = []

    for (let stop = 1; stop <= stops; stop++) {
      await this.page.keyboard.press(key)
      const hidden = await cover.evaluate(focusCoveredBy)
      if (hidden) covered.push(`stop ${stop}: ${hidden}`)
    }

    return covered
  }

  // True once the filter bar has reached the top and changed shape.
  async isBarStuck() {
    return this.page.evaluate(() =>
      document.documentElement.hasAttribute("data-bar-stuck")
    )
  }

  // Each Tab scrolls the next control into view, and one of those scrolls
  // crosses the pin.
  async tabUntilBarSticks() {
    for (let step = 0; step < MAX_TAB_STEPS; step++) {
      if (await this.isBarStuck()) return
      await this.page.keyboard.press("Tab")
    }
  }
}
