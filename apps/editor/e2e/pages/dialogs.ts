import { randomUUID } from "node:crypto"

import type { Locator, Page } from "@playwright/test"

// What will be written, then the commands that write it. No install action.
export class InstallDialog {
  readonly root: Locator
  readonly skillsPane: Locator
  readonly agentsPane: Locator
  readonly footerNote: Locator
  readonly footerCommand: Locator
  // Scoped to the header: both commands below also carry `agents-inc`.
  readonly header: Locator
  // The footer action. Shares its accessible name with the header ✕.
  readonly closeButton: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole("dialog").filter({ hasText: "INSTALL" })
    this.skillsPane = this.root.locator('[data-slot="dialog-pane"]').first()
    this.agentsPane = this.root.locator('[data-slot="dialog-pane"]').last()
    this.footerNote = this.root.locator('[data-slot="dialog-footer-note"]')
    this.footerCommand = this.footerNote.getByText("npx agents-inc edit", {
      exact: true,
    })
    this.header = this.root.locator('[data-slot="dialog-header"]')
    this.closeButton = this.root
      .locator('[data-slot="dialog-footer"]')
      .getByRole("button", { name: "Close" })
  }

  // Reached without the accessibility tree: under a contents preview this
  // dialog is `aria-hidden`, which `getByRole` cannot see.
  get sheet(): Locator {
    return this.page
      .locator('[data-slot="dialog-content"]')
      .filter({ hasText: "npx agents-inc edit" })
  }

  command(text: string): Locator {
    return this.root.locator('[data-slot="command-block"]', { hasText: text })
  }

  get agentRows(): Locator {
    return this.agentsPane.locator('[data-slot="inventory-agent"]')
  }

  // An added skill's inventory row, a button only when it has contents.
  contentsOf(skillName: string): Locator {
    return this.skillsPane.getByRole("button", {
      name: `Contents of ${skillName}`,
    })
  }

  async close() {
    await this.closeButton.click()
  }
}

// Rows are located by path: a bare filename such as `config.ts` names two rows
// once both roots are emitted.
const ROW_SELECTOR = '[data-slot="preview-row"]'

export class OutputPreviewDialog {
  readonly root: Locator
  readonly treePane: Locator
  readonly contentPane: Locator
  // `{path} · {marker}`; the header is the breadcrumb.
  readonly subtitle: Locator
  readonly footerNote: Locator
  readonly closeButton: Locator
  // Named by the action, so both spellings are matched.
  readonly fullscreenButton: Locator
  readonly header: Locator
  readonly splitter: Locator

  constructor(page: Page) {
    this.root = page.getByRole("dialog", { name: "Output preview" })
    this.treePane = this.root.locator('[data-slot="preview-tree"]')
    this.contentPane = this.root.locator('[data-slot="preview-content"]')
    this.subtitle = this.root.locator('[data-slot="preview-subtitle"]')
    this.footerNote = this.root.locator('[data-slot="dialog-footer-note"]')
    this.closeButton = this.root
      .locator('[data-slot="dialog-footer"]')
      .getByRole("button", { name: "Close" })
    this.fullscreenButton = this.root.getByRole("button", {
      name: /^(Fullscreen|Exit fullscreen)$/,
    })
    this.header = this.root.locator('[data-slot="dialog-header"]')
    this.splitter = this.root.getByRole("separator", {
      name: "Resize the file tree",
    })
  }

  /** Drags the splitter by `by` CSS pixels, positive to widen the tree. */
  async dragSplitter(by: number) {
    const handle = await this.splitter.boundingBox()
    if (!handle) throw new Error("the splitter must be drawn")

    const y = handle.y + handle.height / 2
    await this.splitter.page().mouse.move(handle.x + handle.width / 2, y)
    await this.splitter.page().mouse.down()
    // Two moves: a drag that jumps in one event is one some handlers never see.
    await this.splitter
      .page()
      .mouse.move(handle.x + handle.width / 2 + by / 2, y)
    await this.splitter.page().mouse.move(handle.x + handle.width / 2 + by, y)
    await this.splitter.page().mouse.up()
  }

  row(path: string): Locator {
    return this.root.locator(`${ROW_SELECTOR}[data-path="${path}"]`)
  }

  // `allInnerTexts` and `evaluateAll` do not retry, and the tree arrives
  // through `import()`, so every read waits for the first row first.
  private async waitForTree() {
    await this.root.locator(ROW_SELECTOR).first().waitFor({ state: "visible" })
  }

  async rowNames() {
    await this.waitForTree()
    return this.root.locator('[data-slot="preview-row-name"]').allInnerTexts()
  }

  async rowPaths() {
    await this.waitForTree()
    return this.root
      .locator(ROW_SELECTOR)
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-path")))
  }

  async rowPositions() {
    await this.waitForTree()
    return this.root.locator(ROW_SELECTOR).evaluateAll((rows) =>
      rows.map((row) => ({
        path: row.getAttribute("data-path"),
        level: row.getAttribute("aria-level"),
        posinset: row.getAttribute("aria-posinset"),
        setsize: row.getAttribute("aria-setsize"),
      }))
    )
  }

  async focusedRowPath() {
    return this.treePane.evaluate((pane, selector) => {
      const active = pane.ownerDocument.activeElement
      return active instanceof HTMLElement && active.matches(selector)
        ? active.getAttribute("data-path")
        : null
    }, ROW_SELECTOR)
  }

  /** The state label a row carries, `null` on a root or a directory. */
  async markerOf(path: string) {
    return this.row(path).getAttribute("data-marker")
  }

  async pathsMarked(marker: string) {
    await this.waitForTree()
    return this.root
      .locator(`${ROW_SELECTOR}[data-marker="${marker}"]`)
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-path")))
  }

  /** The selected file's text, one entry per line, whitespace intact. */
  async lines() {
    return this.contentPane
      .locator('[data-slot="preview-line"]')
      .allTextContents()
  }

  async select(path: string) {
    await this.row(path).click()
  }

  /** Every `new` file's text, keyed by path, each read once it is selected. */
  async writtenFiles() {
    const files: Record<string, string> = {}

    for (const path of await this.pathsMarked("new")) {
      if (path === null) continue

      await this.select(path)
      await this.row(path)
        .and(this.root.locator('[aria-selected="true"]'))
        .waitFor({ state: "visible" })
      files[path] = (await this.lines()).join("\n")
    }

    return files
  }

  async close() {
    await this.closeButton.click()
  }
}

// An added skill's files. Located by exact name: from Install, two dialogs are
// open at once.
export class SkillContentsDialog {
  readonly root: Locator
  // Read through `textContent` where exact bytes matter.
  readonly body: Locator
  readonly openPath: Locator
  readonly closeButton: Locator

  constructor(page: Page) {
    this.root = page.getByRole("dialog", { name: "Contents" })
    this.body = this.root.locator('[data-slot="contents-body"]')
    this.openPath = this.root.locator('[data-slot="contents-open-path"]')
    this.closeButton = this.root
      .locator('[data-slot="dialog-footer"]')
      .getByRole("button", { name: "Close" })
  }

  file(path: string): Locator {
    return this.root.getByRole("button", { name: path, exact: true })
  }

  async paths() {
    return this.root.locator('[data-slot="contents-file"]').allInnerTexts()
  }

  async open(path: string) {
    await this.file(path).click()
  }

  async close() {
    await this.closeButton.click()
  }
}

// The external skill index, filtered in the browser, staged into pills and
// committed together.
export class AddSkillDialog {
  readonly root: Locator
  readonly results: Locator
  readonly searchInput: Locator
  // The bordered `<label>` box around the field; it has no name of its own.
  readonly searchField: Locator
  readonly footerNote: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    this.root = page.getByRole("dialog").filter({ hasText: "ADD SKILL" })
    this.results = this.root.getByRole("group", { name: "Search results" })
    this.searchInput = this.root.getByLabel("Search external skills")
    this.searchField = this.searchInput.locator("..")
    this.footerNote = this.root.locator('[data-slot="dialog-footer-note"]')
    this.cancelButton = this.root.getByRole("button", { name: "Cancel" })
  }

  // Scoped to the results: staged pills (`Remove docx`) carry the same names.
  result(name: string): Locator {
    return this.results.getByRole("button", { name })
  }

  stagedRow(skillName: string): Locator {
    return this.root
      .locator('[data-slot="staged-skill"]')
      .filter({ hasText: skillName })
  }

  categorySelect(skillName: string): Locator {
    return this.root.getByLabel(`Category for ${skillName}`)
  }

  // An id already held is refused on its staged row.
  refusal(skillName: string): Locator {
    return this.stagedRow(skillName).getByRole("alert")
  }

  get confirmButton(): Locator {
    return this.root.getByRole("button", { name: /^Add \d+ skills?$/ })
  }

  // A fetch that failed, apart from a staged row's refusal.
  get error(): Locator {
    return this.root.locator('[data-slot="dialog-error"]')
  }

  async search(term: string) {
    await this.searchInput.fill(term)
  }

  async stage(fullName: string) {
    await this.result(fullName).click()
  }

  async categorise(skillName: string, category: string) {
    await this.categorySelect(skillName).selectOption({ label: category })
  }

  async confirm() {
    await this.confirmButton.click()
  }

  async cancel() {
    await this.cancelButton.click()
  }
}

// A marketplace and the token that reads it. The token field appears only
// once an answer says a token could change it.
export class MarketplaceDialog {
  readonly root: Locator
  readonly marketplaceInput: Locator
  readonly marketplaceField: Locator
  readonly tokenInput: Locator
  readonly tokenField: Locator
  readonly error: Locator
  // The same status line as `error`; named for the claim a spec makes.
  readonly consequence: Locator
  readonly loadButton: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    this.root = page.getByRole("dialog").filter({ hasText: "MARKETPLACE" })
    this.marketplaceInput = this.root.getByLabel("Marketplace")
    this.marketplaceField = this.marketplaceInput.locator("..")
    this.tokenInput = this.root.getByLabel("Access token")
    this.tokenField = this.tokenInput.locator("..")
    this.error = this.root.getByRole("alert")
    this.consequence = this.error
    this.loadButton = this.root.getByRole("button", { name: "Load" })
    this.cancelButton = this.root.getByRole("button", { name: "Cancel" })
  }

  async fill(marketplace: string) {
    await this.marketplaceInput.fill(marketplace)
  }

  async fillToken(token: string) {
    await this.tokenInput.fill(token)
  }

  async load() {
    await this.loadButton.click()
  }

  async cancel() {
    await this.cancelButton.click()
  }
}

export class MarketplaceSwitchDialog {
  readonly root: Locator
  readonly description: Locator
  readonly confirmButton: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    // Filtered by title: the stack switch is an alert dialog too.
    this.root = page
      .getByRole("alertdialog")
      .filter({ hasText: "Switch marketplace" })
    this.description = this.root.locator(
      '[data-slot="alert-dialog-description"]'
    )
    this.confirmButton = this.root.getByRole("button", {
      name: "Switch marketplace",
    })
    this.cancelButton = this.root.getByRole("button", { name: "Cancel" })
  }

  async confirm() {
    await this.confirmButton.click()
  }

  async cancel() {
    await this.cancelButton.click()
  }
}

// Only reached once the configuration has actually been edited.
export class StackSwitchDialog {
  readonly root: Locator
  readonly description: Locator
  // Where an account's stack's marketplace is named once its payload arrives.
  readonly marketplaceLoading: Locator
  readonly confirmButton: Locator
  // In Switch's place once an account's stack has failed to load.
  readonly retryButton: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    this.root = page.getByRole("alertdialog")
    this.description = this.root.locator(
      '[data-slot="alert-dialog-description"]'
    )
    this.marketplaceLoading = this.root.locator(
      '[data-slot="stack-marketplace-loading"]'
    )
    this.confirmButton = this.root.getByRole("button", { name: "Switch" })
    this.retryButton = this.root.getByRole("button", { name: "Retry" })
    this.cancelButton = this.root.getByRole("button", {
      name: "Keep my setup",
    })
  }

  async confirm() {
    await this.confirmButton.click()
  }

  async retry() {
    await this.retryButton.click()
  }

  async cancel() {
    await this.cancelButton.click()
  }
}

const SAVES_STORAGE_KEY = "agents-inc:saved-stacks:v1"

export type StoredSave = { id: string; name: string; payload: unknown }

type StoredSlot = { saves: StoredSave[]; owed?: string[] }

// Words for the owner's "Save says it needs the account's stacks first"
// (2026-10-24), said while the account's list cannot be read. The ruling gave
// the meaning; the wording is the tests'.
const SAVE_NEEDS_THE_LIST = "Saving needs your account's stacks first."

// The rail Save's dialog. Signed in it stays open through the write; sign-in
// also opens it for a name clash.
export class SaveStackDialog {
  readonly root: Locator
  readonly nameInput: Locator
  readonly saveButton: Locator
  readonly savingButton: Locator
  readonly cancelButton: Locator
  // The header's ✕.
  readonly closeButton: Locator
  readonly alert: Locator
  readonly needsTheList: Locator
  // Read out as the dialog's other refusals are: its words in an alert.
  readonly needsTheListAnnouncement: Locator
  // The grid line's Retry, offered where Save says it: a modal hides the grid.
  readonly retryButton: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole("dialog", { name: "Save stack" })
    this.nameInput = this.root.getByRole("textbox", {
      name: "Name",
      exact: true,
    })
    this.saveButton = this.root.getByRole("button", {
      name: "Save",
      exact: true,
    })
    this.savingButton = this.root.getByRole("button", {
      name: "Saving…",
      exact: true,
    })
    this.cancelButton = this.root.getByRole("button", {
      name: "Cancel",
      exact: true,
    })
    this.closeButton = this.root
      .locator('[data-slot="dialog-header"]')
      .getByRole("button", { name: "Close", exact: true })
    this.alert = this.root.getByRole("alert")
    this.needsTheList = this.root.getByText(SAVE_NEEDS_THE_LIST)
    this.needsTheListAnnouncement = this.alert.filter({
      hasText: SAVE_NEEDS_THE_LIST,
    })
    this.retryButton = this.root.getByRole("button", {
      name: "Retry",
      exact: true,
    })
  }

  async fill(name: string) {
    await this.nameInput.fill(name)
  }

  async save() {
    await this.saveButton.click()
  }

  async cancel() {
    await this.cancelButton.click()
  }

  async saveAs(name: string) {
    await this.fill(name)
    await this.save()
    await this.root.waitFor({ state: "hidden" })
  }

  private async slot(): Promise<StoredSlot | null> {
    const raw = await this.page.evaluate(
      (key) => window.localStorage.getItem(key),
      SAVES_STORAGE_KEY
    )
    if (raw === null) return null

    return (JSON.parse(raw) as { state: StoredSlot }).state
  }

  /** This browser's saves as stored, newest first; `null` before any write. */
  async stored(): Promise<StoredSave[] | null> {
    return (await this.slot())?.saves ?? null
  }

  async owed(): Promise<string[]> {
    const slot = await this.slot()
    if (!slot) return []

    const nameOf = new Map(slot.saves.map((save) => [save.id, save.name]))
    return (slot.owed ?? []).map((id) => nameOf.get(id) ?? id)
  }

  /**
   * Seeds this browser's saves, newest first, and the names of those owed to
   * the account. No `version`, so the blob reads whatever version the store
   * declares.
   */
  async seed(saves: { name: string; payload: unknown }[], owed: string[] = []) {
    const stored = saves.map((save) => ({ id: randomUUID(), ...save }))
    const idOf = new Map(stored.map((save) => [save.name, save.id]))
    const blob = JSON.stringify({
      state: { saves: stored, owed: owed.map((name) => idOf.get(name)) },
    })

    await this.page.evaluate(
      ([key, value]) => window.localStorage.setItem(key!, value!),
      [SAVES_STORAGE_KEY, blob]
    )
  }
}
