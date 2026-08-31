import type { Locator, Page } from "@playwright/test"

// The natural-language composer docked to the foot of the main column.
//
// THE COMPOSER HAS NO MODES AND NO STARTERS. One field, one button. The design
// file drew three modes on a segmented track and looked complete; they were
// removed by owner ruling on 2026-08-26, and the two starter chips that
// replaced them were removed by the design's own next revision — "the
// placeholder does that work". This object has no locator for either on
// purpose: the spec beside it asserts their ABSENCE, which is the regression
// this surface is most likely to grow, and a locator for one would be the first
// half of rebuilding what was cut.

// ── The product's copy, MIRRORED rather than imported ──────────────────────
//
// These are hand-copied from the same sources the component takes them from,
// and the duplication is the design. An assertion that imports the constant the
// component renders cannot fail when that constant changes, because both halves
// move together — so a spec that reached into `composer.tsx` for its expected
// strings would go green through any rewording at all.
//
// Each says whether it is byte-verified against the design source or new copy,
// because a reviewer checking copy drift needs to know which is which.

/**
 * Byte-verified against `Configurator v5.dc.html`'s own `DOCK_PH`.
 *
 * It names all three capabilities in one sentence, which is the whole argument
 * for having neither modes nor starter chips: the field says what it takes.
 */
export const COMPOSER_PLACEHOLDER =
  "Describe a stack, change what is selected, or ask how something works…"

/** Byte-verified: the design draws the dock's one button as `Send ⌘↩`. */
export const COMPOSER_SEND_LABEL = "Send"

/**
 * NEW copy, and now UNDRAWN. The design's control row holds the send button and
 * nothing else, so the claim it carries reaches the accessible description
 * alone — the field and the button both point at it, and neither the eye nor
 * the layout sees it.
 */
export const COMPOSER_HINT = "nothing changes until you apply"

/** NEW copy. The design's template yields `0 changes`, which reads as a bug. */
export const PROPOSAL_NO_CHANGES = "no changes"

/**
 * The reason line a SIGNED-OUT submit produces, verbatim.
 *
 * It replaced `No model is connected yet — …` when EDITOR-54 landed: there is a
 * model now, and the composer is signed-in only because every call spends real
 * money. The specs around this constant did not otherwise change, and that is
 * the point — they were about the block's shape and its zero-change footer, and
 * both still hold under a refusal.
 */
export const PROPOSAL_NO_MODEL_REASON =
  "Sign in to use the composer — nothing was sent."

/** U+201C / U+201D. The echoed sentence is wrapped in these as CONTENT. */
export const OPEN_QUOTE = "“"
export const CLOSE_QUOTE = "”"

/**
 * What the send button publishes for anyone who cannot see the `⌘↩` glyph pair
 * beside its label. Both chords are bound on every platform — a bound key that
 * is not drawn costs nothing, and a drawn key that is not bound is a lie.
 */
export const SEND_KEY_SHORTCUTS = "Meta+Enter Control+Enter"

// Four hooks that are not landmarks and have no accessible name of their own,
// so each is reached by `data-slot` — the package's stated stable hook, and the
// idiom `preview-tree` / `field-label` / `staged-skill` already use here.
//
// The dock is the composer's ROOT and the band is only its last child, so the
// geometry criteria measure this rather than the band: the dock grows a
// conditional child above the band (a proposal, after a submit) and whatever
// has to clear the composer has to clear the taller thing.
const DOCK = '[data-slot="composer-dock"]'
// The hint's own element. Located structurally rather than by its text so a
// reworded hint fails as "expected X, received Y" rather than as "element not
// found", which is the difference between a report a reviewer can act on and
// one they have to reproduce.
const HINT = '[data-slot="composer-hint"]'
// The reason line in the proposal's footer. It is deliberately OUTSIDE the
// header's live region, and asserting that needs a locator that is not the
// region's.
const PROPOSAL_REASON = '[data-slot="proposal-reason"]'
// One row of the proposal's four-column list: mark, name, load word.
const PROPOSAL_ROW = '[data-slot="proposal-row"]'

export class Composer {
  /** The whole composer: the conditional child and the band beneath it. */
  readonly dock: Locator
  /** The band the field and the control row sit in — `region`, and full-bleed. */
  readonly band: Locator
  readonly field: Locator
  readonly sendButton: Locator
  readonly hint: Locator
  /** Present only after a submit; ABSENT rather than hidden. */
  readonly proposal: Locator
  /**
   * The proposal's header, and the only live region in it. `status` rather than
   * `alert`: nothing went wrong, so it should wait for a pause rather than
   * interrupt — and a second `alert` inside `main` would make
   * `ConfigurePage.importNotice` ambiguous under strict mode.
   */
  readonly proposalHeader: Locator
  readonly proposalReason: Locator
  /** Every named row in the block's list, in document order. */
  readonly proposalRows: Locator
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
    // The visible labels stay `Apply` and `Discard`; the accessible names say
    // what is applied and what is discarded, which is how this codebase names
    // controls (`Remove ${name}`, `Contents of ${displayName}`).
    this.applyButton = page.getByRole("button", { name: "Apply proposal" })
    this.discardButton = page.getByRole("button", { name: "Discard proposal" })
  }

  /** What the field holds right now. */
  async draft() {
    return this.field.inputValue()
  }

  async type(sentence: string) {
    await this.field.fill(sentence)
  }

  async send() {
    await this.sendButton.click()
  }

  /**
   * Submits from the field itself. Both chords are asserted, because both are
   * bound everywhere and a platform check that drops one is invisible on the
   * platform that keeps it.
   */
  async submitWithKeys(chord: "Control+Enter" | "Meta+Enter") {
    await this.field.press(chord)
  }

  /**
   * The field's drawn height against the height of what it holds.
   *
   * A `max-h` on a growing field is a load-bearing layout claim — the dock is
   * sticky at the viewport bottom, so an uncapped field eventually covers the
   * page — and a CSS declaration being present in the DOM is not evidence that
   * it is in effect. So it is measured rather than asserted as a class.
   */
  async fieldBox() {
    return this.field.evaluate((node) => ({
      client: node.clientHeight,
      scroll: node.scrollHeight,
    }))
  }

  /** Whether the band's own contents fit it, which is what G6 asks. */
  async bandOverflow() {
    return this.band.evaluate((node) => ({
      scroll: node.scrollWidth,
      client: node.clientWidth,
    }))
  }
}
