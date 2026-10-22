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
import { Toasts } from "./toasts"

const CONFIGURE_URL = "/"

const MARKETPLACE_STORAGE_KEY = "agents-inc:marketplace:v1"

const UI_STORAGE_KEY = "agents-inc:ui:v1"

const CONFIG_STORAGE_KEY = "agents-inc:config:v1"

const SAVED_STACK_STORAGE_KEY = "agents-inc:saved-stack:v1"

// The persist version this release writes; the key's `v1` is not it.
const MARKETPLACE_PERSIST_VERSION = 2

// The keyed shape whose keys are bare `owner/repo` refs.
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

const LATTICE = '[data-slot="lattice"]'

const MARKETPLACE_SECTION = '[data-slot="marketplace-row"]'

// Far enough past the bar's own top that it has pinned and changed shape.
const PAST_THE_PIN = 400

// Room around an element for a ring drawn outside its box.
const RING_ROOM = 4

type Stroke = { colour: string; width: number; inset: number }

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

// The page's ground in each theme, quoted from the design's palette rather than
// read from the stylesheet, so an assertion against it can fail.
export const PAGE_BACKGROUND = {
  light: "rgb(255, 255, 255)",
  dark: "rgb(22, 21, 19)",
} as const satisfies Record<"light" | "dark", string>

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
  // One tab per domain, scoped as a group: a bare `button` under the bar also
  // matches the add-skill block.
  readonly domainTabs: Locator
  // Drawn once something is selected; by the group's name, which is fixed while
  // counts move.
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
  readonly toasts: Toasts

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
    this.toasts = new Toasts(page)
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

  async chosenMarketplace() {
    return (await this.savedMarketplaces())?.current ?? null
  }

  /** `""` is a marketplace saved without a token; `null` is one never saved. */
  async savedToken(marketplace: string) {
    return (await this.savedMarketplaces())?.saved[marketplace] ?? null
  }

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

  /** Seeds the keyed slot under a bare `owner/repo` key. */
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
    // Hidden ones too: a dialog that opens on arrival hides the stacks from
    // role queries, and can be up before this first looks.
    await this.page
      .getByRole("group", { name: "Stacks", includeHidden: true })
      .waitFor()
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

  // The domain in view, as the strip tells assistive technology.
  get activeDomainTab(): Locator {
    return this.domainTabs.locator('[aria-current="true"]')
  }

  // Where a domain's skills begin: the top of its first category.
  domainStart(label: string): Locator {
    return this.domain(label).getByRole("group").first()
  }

  // Measured rather than a coordinate, because the grid's height is the
  // generated catalogue's.
  async scrollToDomain(label: string) {
    await this.domainStart(label).evaluate((start) =>
      window.scrollTo(0, window.scrollY + start.getBoundingClientRect().top)
    )
  }

  // How far a domain's top edge sits below the bar's underside. Negative is
  // hidden behind the bar; a large positive means the jump undershot. One read,
  // so the two edges are measured in the same frame.
  async domainGapUnderBar(label: string) {
    return this.domainStart(label).evaluate((start) => {
      const bar = document.querySelector('[data-slot="filter-bar"]')
      if (!bar) throw new Error("the bar must be drawn")

      return (
        start.getBoundingClientRect().top - bar.getBoundingClientRect().bottom
      )
    })
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

  /**
   * Every line `target` paints around itself, whichever of its own box, its
   * `::before` or its `::after` draws it, as an outline or a top border.
   * `inset` is how far inside `target`'s box the line's outer edge sits.
   */
  async strokes(target: Locator): Promise<Stroke[]> {
    return target.evaluate((node) =>
      [null, "::before", "::after"].flatMap((pseudo) => {
        const style = getComputedStyle(node, pseudo)
        if (pseudo !== null && style.content === "none") return []

        const at = pseudo === null ? 0 : Number.parseFloat(style.top) || 0
        const outline = Number.parseFloat(style.outlineWidth)
        const border = Number.parseFloat(style.borderTopWidth)
        const painted = (colour: string) => colour !== "rgba(0, 0, 0, 0)"

        return [
          ...(style.outlineStyle !== "none" &&
          outline > 0 &&
          painted(style.outlineColor)
            ? [
                {
                  colour: style.outlineColor,
                  width: outline,
                  inset:
                    at - (Number.parseFloat(style.outlineOffset) + outline),
                },
              ]
            : []),
          ...(style.borderTopStyle !== "none" &&
          border > 0 &&
          painted(style.borderTopColor)
            ? [{ colour: style.borderTopColor, width: border, inset: at }]
            : []),
        ]
      })
    )
  }

  /**
   * Whether anything `target` draws in `token` reaches the screen: photographed
   * as drawn, then with the token transparent on it. A paint clipped or covered
   * changes no pixel. `target` must already be on screen.
   */
  async paintsWith(target: Locator, token: string) {
    const box = await target.boundingBox()
    if (!box) throw new Error("the element must be drawn to be photographed")

    const clip = {
      x: box.x - RING_ROOM,
      y: box.y - RING_ROOM,
      width: box.width + 2 * RING_ROOM,
      height: box.height + 2 * RING_ROOM,
    }
    const photograph = () =>
      this.page.screenshot({ clip, animations: "disabled" })
    // Both spellings: a utility reads one and an arbitrary value the other.
    const names = [`--${token}`, `--color-${token}`]

    const drawn = await photograph()
    await target.evaluate((node, keys) => {
      for (const key of keys) node.style.setProperty(key, "transparent")
    }, names)
    const withoutIt = await photograph()
    await target.evaluate((node, keys) => {
      for (const key of keys) node.style.removeProperty(key)
    }, names)

    return !drawn.equals(withoutIt)
  }

  // Whether the focused `target` shows a ring in the ring token.
  async focusRing(target: Locator) {
    const focused = await target.evaluate(
      (node) => node === document.activeElement
    )
    return { focused, ringVisible: await this.paintsWith(target, "ring") }
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

  // How many cells fit across, measured off the boxes: the grid's width over
  // one cell's, which its padding cannot round to another count.
  async latticeTracks(lattice: Locator) {
    const grid = await lattice.boundingBox()
    const cell = await lattice
      .locator('[data-slot="lattice-cell"]')
      .first()
      .boundingBox()
    if (!grid || !cell) throw new Error("the grid and a cell must be drawn")

    return Math.round(grid.width / cell.width)
  }

  // Scope to a category when a skill name might repeat across domains.
  skill(name: string, scope?: Locator): SkillCell {
    return new SkillCell(this.page, name, scope)
  }

  skillIn(domainLabel: string, categoryName: string, name: string): SkillCell {
    return this.skill(name, this.category(domainLabel, categoryName))
  }

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
   * Every keyboard stop that `cover` hides, so a failure names the controls and
   * pixels.
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
