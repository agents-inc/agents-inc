import type { Locator, Page } from "@playwright/test"

// The natural-language composer docked to the foot of the main column.
//
// THE COMPOSER HAS NO MODES. One field, one button, and two suggestion chips
// that prefill the field for the visitor to finish. The design file draws three
// modes on a segmented track and looks complete; they were removed by owner
// ruling on 2026-08-26, and this object has no locator for one on purpose — the
// spec beside it asserts their ABSENCE, which is the regression this phase is
// most likely to grow.
//
// The chips are a writing aid rather than a mode: nothing records which one was
// clicked, so `suggestion()` returns a plain button and there is deliberately no
// `activeSuggestion` or `pressedSuggestion` accessor here. A locator for one
// would be the first half of rebuilding what was cut.

// ── The product's copy, MIRRORED rather than imported ──────────────────────
//
// These are hand-copied from the same sources the component takes them from,
// and the duplication is the design. An assertion that imports the constant the
// component renders cannot fail when that constant changes, because both halves
// move together — so a spec that reached into `composer.tsx` for its expected
// strings would go green through any rewording at all.
//
// Two of the three below are byte-verified against the design source and one is
// new copy invented by the spec; a reviewer checking copy drift needs to know
// which is which, so each says so.

/** Byte-verified: `Chat Composer Lab.dc.html` option `91j`, line 364. */
export const COMPOSER_PLACEHOLDER =
  "Describe your project, or ask for a change…"

/** Byte-verified: the same lab draws it at `91b`, `91d` and `91j`. */
export const COMPOSER_SEND_LABEL = "Send"

/**
 * NEW copy, proposed by the Phase C spec and verified against nothing. It is
 * one of only two strings in this phase with no source, so if it has drifted it
 * drifted in implementation.
 */
export const COMPOSER_HINT = "nothing changes until you apply"

/**
 * The two openers, in the owner's own order and words.
 *
 * Exactly two. A third is a design decision with a written reason, not a free
 * slot — an `Explain…` or `Tell me about…` opener in particular is the cut
 * `ask` mode wearing a chip.
 */
export const SUGGESTION_LABELS = [
  "Change my setup to…",
  "Create a new setup with…",
] as const

/**
 * The single U+2026 HORIZONTAL ELLIPSIS every opener and the placeholder end
 * on. Named because the prefill is a DERIVATION of the label — the chip's text
 * with this replaced by one space — rather than a second table of strings that
 * could drift from the labels.
 */
export const ELLIPSIS = "…"

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
// conditional child above the band (the chips at rest, a proposal after a
// submit) and whatever has to clear the composer has to clear the taller thing.
const DOCK = '[data-slot="composer-dock"]'
// The hint's own element. Located structurally rather than by its text so a
// reworded hint fails as "expected X, received Y" rather than as "element not
// found", which is the difference between a report a reviewer can act on and
// one they have to reproduce.
const HINT = '[data-slot="composer-hint"]'
// The `.dfn` line in the proposal's footer. It is deliberately OUTSIDE the
// header's live region, and asserting that needs a locator that is not the
// region's.
const PROPOSAL_REASON = '[data-slot="proposal-reason"]'
// A chip's label span, beside its `aria-hidden` `→` mark. The mark is in the
// button's `textContent` and not in its accessible name, so the set of labels
// is read here rather than off the buttons.
const SUGGESTION_LABEL = '[data-slot="suggestion-label"]'

export class Composer {
  /** The whole composer: the conditional children and the band beneath them. */
  readonly dock: Locator
  /** The band the field and the control row sit in — `region`, and full-bleed. */
  readonly band: Locator
  readonly field: Locator
  readonly sendButton: Locator
  readonly hint: Locator
  /** Present exactly while the draft is blank; ABSENT rather than hidden. */
  readonly suggestions: Locator
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
    this.suggestions = page.getByRole("group", { name: "Prompt suggestions" })
    this.proposal = page.getByRole("region", { name: "Proposal" })
    this.proposalHeader = this.proposal.getByRole("status")
    this.proposalReason = this.proposal.locator(PROPOSAL_REASON)
    // The visible labels stay `Apply` and `Discard`; the accessible names say
    // what is applied and what is discarded, which is how this codebase names
    // controls (`Remove ${name}`, `Contents of ${skill.displayName}`).
    this.applyButton = page.getByRole("button", { name: "Apply proposal" })
    this.discardButton = page.getByRole("button", { name: "Discard proposal" })
  }

  /** One opener, by the accessible name it announces — the visible label. */
  suggestion(label: string): Locator {
    return this.suggestions.getByRole("button", { name: label, exact: true })
  }

  /** Every opener's label span, in document order. */
  get suggestionLabels(): Locator {
    return this.suggestions.locator(SUGGESTION_LABEL)
  }

  /** Every opener as a control, for asking whether any are on screen at all. */
  get suggestionButtons(): Locator {
    return this.suggestions.getByRole("button")
  }

  /** What the field holds right now. */
  async draft() {
    return this.field.inputValue()
  }

  async type(sentence: string) {
    await this.field.fill(sentence)
  }

  /**
   * Types wherever the caret already is, rather than through the field's own
   * locator.
   *
   * `Locator.pressSequentially` focuses its target first, which would hide the
   * thing being asserted: after an opener is clicked the field is already
   * focused with the caret after the inserted space, and the claim is that the
   * visitor's NEXT KEYSTROKE lands there. Going through the keyboard is the
   * only way to make that keystroke the same one a person would send.
   */
  async continueTyping(text: string) {
    await this.page.keyboard.type(text)
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
   * Where the caret sits and how long the value is, read in one evaluate.
   *
   * One snapshot rather than three reads: the chip's click writes the draft,
   * focuses the field and places the caret, and asking about those separately
   * can answer about three different moments.
   */
  async caret() {
    return this.field.evaluate((node) => {
      const field = node as HTMLTextAreaElement
      return {
        start: field.selectionStart,
        end: field.selectionEnd,
        length: field.value.length,
      }
    })
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
