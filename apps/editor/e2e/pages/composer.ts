import type { Locator, Page } from "@playwright/test"

// Copy is mirrored, never imported, so a rewording fails the spec.

/** Byte-verified against the design's `DOCK_PH`. */
export const COMPOSER_PLACEHOLDER =
  "Describe a stack, change what is selected, or ask how something works…"

/** Byte-verified: the design draws the dock's one button as `Send ⌘↩`. */
export const COMPOSER_SEND_LABEL = "Send"

/** Undrawn: reaches the accessible description only. */
export const COMPOSER_HINT = "nothing changes until you apply"

/** The design's template yields `0 changes`, which reads as a bug. */
export const PROPOSAL_NO_CHANGES = "no changes"

/** The reason line a signed-out submit produces. */
export const PROPOSAL_NO_MODEL_REASON =
  "Sign in to use the composer — nothing was sent."

/** U+201C / U+201D. The echoed sentence is wrapped in these as CONTENT. */
export const OPEN_QUOTE = "“"
export const CLOSE_QUOTE = "”"

/** Both chords are bound on every platform. */
export const SEND_KEY_SHORTCUTS = "Meta+Enter Control+Enter"

// Reached by `data-slot`: none is a landmark or has a name.
const DOCK = '[data-slot="composer-dock"]'
// Located structurally so a reworded hint fails as a text mismatch.
const HINT = '[data-slot="composer-hint"]'
// Outside the header's live region.
const PROPOSAL_REASON = '[data-slot="proposal-reason"]'
const PROPOSAL_ROW = '[data-slot="proposal-row"]'

export class Composer {
  /** The whole composer: the conditional child and the band beneath it. */
  readonly dock: Locator
  readonly band: Locator
  readonly field: Locator
  readonly sendButton: Locator
  readonly hint: Locator
  /** Present only after a submit; ABSENT rather than hidden. */
  readonly proposal: Locator
  /**
   * `status`, not `alert`: a second alert in `main` would make `importNotice`
   * ambiguous.
   */
  readonly proposalHeader: Locator
  readonly proposalReason: Locator
  readonly proposalRows: Locator
  readonly proposalBody: Locator
  readonly applyButton: Locator
  readonly discardButton: Locator

  constructor(readonly page: Page) {
    this.dock = page.locator(DOCK)
    this.band = page.getByRole("region", { name: "Natural-language composer" })
    this.field = this.dock.getByRole("textbox", { name: "Composer prompt" })
    this.sendButton = this.dock.getByRole("button", {
      name: COMPOSER_SEND_LABEL,
      exact: true,
    })
    this.hint = this.dock.locator(HINT)
    this.proposal = page.getByRole("region", { name: "Proposal" })
    this.proposalHeader = this.proposal.getByRole("status")
    this.proposalReason = this.proposal.locator(PROPOSAL_REASON)
    this.proposalRows = this.proposal.locator(PROPOSAL_ROW)
    this.proposalBody = this.proposal.getByRole("region", {
      name: "Proposed changes",
    })
    this.applyButton = page.getByRole("button", { name: "Apply proposal" })
    this.discardButton = page.getByRole("button", { name: "Discard proposal" })
  }

  async draft() {
    return this.field.inputValue()
  }

  async type(sentence: string) {
    await this.field.fill(sentence)
  }

  async send() {
    await this.sendButton.click()
  }

  async submitWithKeys(chord: "Control+Enter" | "Meta+Enter") {
    await this.field.press(chord)
  }

  /** Measured: a `max-h` class in the DOM is no evidence it is in effect. */
  async fieldBox() {
    return this.field.evaluate((node) => ({
      client: node.clientHeight,
      scroll: node.scrollHeight,
    }))
  }

  /** Measured, as `fieldBox` is; `room` is how far the list can scroll. */
  async proposalBodyScroll() {
    return this.proposalBody.evaluate((node) => ({
      top: node.scrollTop,
      room: node.scrollHeight - node.clientHeight,
    }))
  }

  async bandOverflow() {
    return this.band.evaluate((node) => ({
      scroll: node.scrollWidth,
      client: node.clientWidth,
    }))
  }
}
