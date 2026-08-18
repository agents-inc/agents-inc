import type { Locator, Page } from "@playwright/test"

// What will be written, then the commands that write it. No install action.
export class InstallDialog {
  readonly root: Locator
  readonly skillsPane: Locator
  readonly agentsPane: Locator
  readonly footerNote: Locator
  // The line under the title: which marketplace this install comes from, and
  // which stack it was built with. Scoped to the header rather than read off
  // the whole sheet, because both commands below carry the CLI's own
  // `agents-inc` — so only the header can say whether the marketplace named is
  // the one the grid is running on.
  readonly header: Locator
  // The footer action. Shares its accessible name with the header ✕.
  readonly closeButton: Locator
  // The header ✕.
  readonly dismissButton: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole("dialog").filter({ hasText: "INSTALL" })
    this.skillsPane = this.root.locator('[data-slot="dialog-pane"]').first()
    this.agentsPane = this.root.locator('[data-slot="dialog-pane"]').last()
    this.footerNote = this.root.locator('[data-slot="dialog-footer-note"]')
    this.header = this.root.locator('[data-slot="dialog-header"]')
    this.closeButton = this.root
      .locator('[data-slot="dialog-footer"]')
      .getByRole("button", { name: "Close" })
    this.dismissButton = this.root
      .locator('[data-slot="dialog-header"]')
      .getByRole("button", { name: "Close" })
  }

  // The sheet itself, reached WITHOUT the accessibility tree. While a contents
  // preview is open on top of it this dialog is `aria-hidden` — correct for a
  // modal underneath another, and invisible to `getByRole` — so "still there
  // behind" is a question only a CSS locator can ask.
  get sheet(): Locator {
    return this.page
      .locator('[data-slot="dialog-content"]')
      .filter({ hasText: "npx agents-inc edit" })
  }

  command(text: string): Locator {
    return this.root.locator('[data-slot="command-block"]', { hasText: text })
  }

  // The inventory row for an added skill, which doubles as the way into its
  // contents — a name that is a button only when there is something to read.
  contentsOf(skillName: string): Locator {
    return this.skillsPane.getByRole("button", {
      name: `Contents of ${skillName}`,
    })
  }

  async close() {
    await this.closeButton.click()
  }
}

// What an added skill actually holds: one file's text, and the directory it
// came in beside it. Located by its accessible name rather than by substring —
// two dialogs are open at once whenever this is reached from Install, so the
// two have to be told apart by something exact.
export class SkillContentsDialog {
  readonly root: Locator
  // The file on show, and its whole text. Read through `textContent` rather
  // than a text assertion wherever the exact bytes matter: this is a preview of
  // what the CLI will write, so normalised whitespace would be a different file.
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

  // Every path in the tree, in the order it is offered.
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
  readonly searchInput: Locator
  readonly footerNote: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    this.root = page.getByRole("dialog").filter({ hasText: "ADD SKILL" })
    this.searchInput = this.root.getByLabel("Search external skills")
    this.footerNote = this.root.locator('[data-slot="dialog-footer-note"]')
    this.cancelButton = this.root.getByRole("button", { name: "Cancel" })
  }

  // Result rows are the add-skill lattice; the skill's own name identifies one.
  result(name: string): Locator {
    return this.root
      .locator('[data-slot="lattice-row"]')
      .filter({ hasText: name })
  }

  // One staged skill, waiting on the category that will place it.
  stagedRow(skillName: string): Locator {
    return this.root
      .locator('[data-slot="staged-skill"]')
      .filter({ hasText: skillName })
  }

  // The confirmed placement. A dropdown rather than a guess: an external skill
  // is a real catalogue entry, so it needs a real category, and nothing about a
  // repository can be read to mean one (CLI-412).
  categorySelect(skillName: string): Locator {
    return this.root.getByLabel(`Category for ${skillName}`)
  }

  // Said on the staged row, at the moment the id is in hand — a second skill
  // resolving to an id something already holds is refused there rather than
  // discovered at install time.
  refusal(skillName: string): Locator {
    return this.stagedRow(skillName).getByRole("alert")
  }

  get confirmButton(): Locator {
    return this.root.getByRole("button", { name: /^Add \d+ skills?$/ })
  }

  // The dialog's own failure line — content that could not be resolved. Kept
  // apart from a staged row's refusal, which is about an id rather than a fetch.
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

// The marketplace the grid runs on: a name that identifies a repository, and a
// token that only authorizes reading it. The token field is progressive — it is
// not on screen until an answer arrives that a token could change — which is
// what keeps the public case a single field.
export class MarketplaceDialog {
  readonly root: Locator
  readonly marketplaceInput: Locator
  readonly tokenInput: Locator
  readonly error: Locator
  // What the load would cost, named before it happens — the switcher's own
  // sentence, at the other door to the same act.
  //
  // The SAME element as `error` above, and deliberately so: the dialog has one
  // status line and its state is a union, so a refusal and a consequence can
  // never be on screen together. Two names because they are two claims, and a
  // spec that asserts a consequence should not have to say `error` to do it.
  readonly consequence: Locator
  readonly loadButton: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    this.root = page.getByRole("dialog").filter({ hasText: "MARKETPLACE" })
    this.marketplaceInput = this.root.getByLabel("Marketplace")
    this.tokenInput = this.root.getByLabel("Access token")
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

// The confirmation a marketplace switch opens, and the only thing that can
// perform one: the switch happens on the CTA and nowhere else.
//
// Its description is the point rather than its buttons — it has to name the
// skills the target does not carry, since that set is computable before the
// switch and is the whole of what the switch costs. A generic warning is a
// dialog people click through.
export class MarketplaceSwitchDialog {
  readonly root: Locator
  readonly description: Locator
  readonly confirmButton: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    // Filtered by its own title: the stack switch is an alert dialog too, and
    // two things located by role alone would be one flaky locator.
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
  readonly confirmButton: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    this.root = page.getByRole("alertdialog")
    this.confirmButton = this.root.getByRole("button", { name: "Switch" })
    this.cancelButton = this.root.getByRole("button", {
      name: "Keep my setup",
    })
  }

  async confirm() {
    await this.confirmButton.click()
  }

  async cancel() {
    await this.cancelButton.click()
  }
}
