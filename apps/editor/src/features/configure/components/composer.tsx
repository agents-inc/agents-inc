import { Button } from "@workspace/ui/components/button"
import { useId, useRef, useState } from "react"

import { composeProposal, type ComposeRefusal } from "@/lib/api/compose"
import { groupsFor } from "../lib/compose-proposal"
import { useCatalogStore } from "@/stores/catalog-store"
import { useConfigStore } from "@/stores/config-store"

import { ProposalBlock } from "./proposal"

import type { Proposal } from "./proposal"
import type { KeyboardEvent } from "react"

/**
 * A SENTENCE AT THE FOOT OF THE COLUMN, AND A PROPOSAL BACK.
 *
 * Notched into the grid rather than floated over it: full-bleed, a hairline top
 * and bottom, no side borders — a full-bleed element's sides would land on the
 * column dividers — and no drop shadow, which in this design belongs to modal
 * dialogs alone. Nine other float treatments were built and rejected to arrive
 * at this one (`Dock Float Lab.dc.html` turn 93: scrim fade, hard band,
 * recessed well, dark band, frosted blur, proud outline, lip edge, dark field,
 * and a non-floating column floor). Do not reintroduce any of them.
 *
 * The band holds EXACTLY TWO CHILDREN and nothing between them: no rule, no
 * spacer, no `border-top` on the control row. That is an explicit removal in
 * the design log — "one field, not two stacked things" — and the lab's own base
 * rule carried the divider this variant deletes.
 *
 * Nothing here is persisted. No effect and no router: every derivation on
 * screen — whether the button is live, whether a proposal is stale — falls out
 * of the draft, the proposal and whether an answer is still owed.
 */

// ── The copy, and the two things that are NOT here ─────────────────────────
//
// The design drew THREE MODES — `build`, `adjust`, `ask` — each with its own
// placeholder, send verb and hint, on a segmented track between the hint and
// the button. All of it was removed by owner ruling on 2026-08-26: `build` and
// `adjust` "essentially do the same thing", and the settled output schema has
// no field for the properties `adjust` was meant to edit — structured outputs
// require `additionalProperties: false`, so a record keyed by skill id cannot
// be expressed at all. A distinction neither the UI nor the schema could carry
// was not a distinction.
//
// Then it drew TWO STARTER CHIPS in their place, which pre-filled the field
// with a sentence opening. They were built, shipped, and cut by the design's
// own next revision — "the placeholder does that work" — and the placeholder
// below is the one it was rewritten to. Both removals are in the design log;
// a reader who finds either drawn somewhere is holding a superseded sheet.

/** Byte-verified against `Configurator v5.dc.html`'s own `DOCK_PH`. It names
 *  all three capabilities in one sentence, which is the whole argument for
 *  having neither modes nor chips: the field says what it takes. */
const PLACEHOLDER =
  "Describe a stack, change what is selected, or ask how something works…"

/** Byte-verified: the design draws the dock's one button as `Send ⌘↩`. Honest,
 *  too — pressing it SENDS a sentence, and the proposal has its own `Apply`. */
const SEND_LABEL = "Send"

/** NEW copy, and now UNDRAWN. The control row holds the send button and
 *  nothing else, so this reaches the accessible description alone: the claim
 *  is worth making to somebody who cannot see the proposal's own footer, and
 *  the design is explicit that nothing sits beside the button. */
const HINT = "nothing changes until you apply"

// ── The keyboard ───────────────────────────────────────────────────────────

/**
 * Which chord to DRAW. U+2318 PLACE OF INTEREST SIGN and U+21A9 LEFTWARDS ARROW
 * WITH HOOK, adjacent, with no space, no plus sign and no key caps — exactly as
 * the design has them, and neither is U+23CE nor U+21B5.
 *
 * Only one is drawn, and BOTH are bound on every platform: a bound key that is
 * not drawn costs nothing, and a drawn key that is not bound is a lie.
 */
const IS_APPLE_PLATFORM = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
const SEND_CHORD = IS_APPLE_PLATFORM ? "⌘↩" : "Ctrl↩"

/** What the hidden glyph publishes to anyone who cannot see it. The one
 *  standard attribute for this, and it names both chords because both are
 *  bound. */
const SEND_KEY_SHORTCUTS = "Meta+Enter Control+Enter"

/**
 * Whether this keystroke is the submit one — and, by omission, the rule that a
 * plain `Enter` inserts a newline instead. The button draws a modifier
 * affordance that would be pointless if the bare key submitted too, and the
 * field is a prose box whose own placeholder invites a sentence.
 */
const isSubmitChord = (event: KeyboardEvent<HTMLTextAreaElement>) =>
  event.key === "Enter" && (event.metaKey || event.ctrlKey)

/**
 * Six lines at the field's own 19px line box, past which it scrolls.
 *
 * The dock is sticky at the viewport's foot, so an uncapped field would
 * eventually cover the page it is docked to. The constant is the whole utility
 * rather than its number: Tailwind reads class strings out of the source, so a
 * figure interpolated into one compiles to nothing at all — no build error, no
 * lint error, just an uncapped field.
 */
const FIELD_HEIGHT_CAP = "max-h-[7.125rem]"

// What a refusal says, in the composer's own words. The worker sends a code
// rather than a sentence for the reason `ShareRefusal` does: these are
// different situations for the person at the keyboard, and only one of them
// names something they can do about it.
const REFUSAL_COPY: Record<ComposeRefusal, string> = {
  "signed-out": "Sign in to use the composer — nothing was sent.",
  "too-many": "Too many requests in a minute. Try again shortly.",
  refused: "The model did not answer. Nothing changed.",
  unreachable: "Could not reach the composer. Nothing changed.",
}

const THINKING_REASON = "Choosing skills…"

export function Composer() {
  const [draft, setDraft] = useState("")
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [pending, setPending] = useState(false)
  // The ids behind the rows on screen. Kept beside the proposal rather than
  // read back off it, because a row carries a display name and `toggleSkill`
  // takes an id — and matching a name back to an id is a lookup that can miss.
  const [appliedIds, setAppliedIds] = useState<string[]>([])
  const skillById = useCatalogStore((state) => state.skillById)
  const selected = useConfigStore((state) => state.skills)
  const toggleSkill = useConfigStore((state) => state.toggleSkill)
  // Mounted for as long as the composer is, and every handler that reads it is
  // an event handler on one of its own siblings — so the guards below are the
  // ref type's rather than a state this app can be in.
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const hintId = useId()

  // `trim` rather than `=== ""`, so a field holding three spaces is the empty
  // state it looks like: the button stays out of reach and the chord's own
  // first line refuses.
  const blank = draft.trim() === ""

  // Whether the field still holds the sentence an answer was asked for. Read
  // off the ref rather than off state, because an answer arrives inside a
  // closure that captured the draft as it stood at the press.
  const stillAsked = (sentence: string) =>
    !fieldRef.current || fieldRef.current.value === sentence

  // A stale answer to a changed question is worse than no answer, and editing
  // the sentence is the only way to change the question — there is no other
  // input to it, the second trigger having been a mode change. The second write
  // VOIDS AN ANSWER; it does not record an intent, which is what a mode is.
  //
  // The fourth stops the wait outliving the question: an answer nobody is owed
  // any more may not go on holding the field shut, or a visitor who rephrases
  // mid-flight is locked out until a reply that will be dropped comes back.
  const revise = (next: string) => {
    setDraft(next)
    setProposal(null)
    setAppliedIds([])
    setPending(false)
  }

  // The sentence that was SENT, echoed and then left alone: it goes on being
  // editable underneath, and editing it voids the answer rather than rewriting
  // this. A pending block is drawn immediately for the same reason the openers
  // are — the dock never sits in a state that says nothing about what it did.
  const submit = async () => {
    if (blank || pending) return

    const sentence = draft
    // Ahead of the state that disables the button, because a disabled control
    // cannot hold focus: a press from the button itself would otherwise drop
    // the caret to `<body>`. The field is where `Discard` hands it back for the
    // same reason, and where a submit from the chord already has it.
    fieldRef.current?.focus()
    setPending(true)
    setProposal({
      sentence,
      groups: [],
      reason: THINKING_REASON,
      pending: true,
    })

    const result = await composeProposal(sentence)

    // The draft moved on while the request was in flight, so this answer is to
    // a question nobody is asking any more. Dropped rather than drawn: a stale
    // proposal under a changed sentence is the one thing `revise` exists to
    // prevent, and an in-flight request is the one path around it.
    //
    // AHEAD OF `setPending` rather than after it, because the flag belongs to
    // whichever request is current: `revise` already cleared it, and a newer
    // submit may have set it again for a round trip still running. Two requests
    // for the identical sentence cannot be told apart here and do not need to
    // be — they asked the same question.
    if (!stillAsked(sentence)) return
    setPending(false)

    if (!result.ok)
      return setProposal({
        sentence,
        groups: [],
        reason: REFUSAL_COPY[result.refusal],
      })

    // One derivation of what `Apply` will add, read twice: the rows on screen
    // and the ids behind them. Filtering the ids again here is how the block
    // comes to promise one thing and do another.
    const { groups, ids } = groupsFor(
      result.proposal.skillIds,
      skillById,
      selected
    )
    setAppliedIds(ids)
    setProposal({ sentence, groups, reason: result.proposal.reason })
  }

  // Selecting each proposed skill through the app's own verb, one at a time.
  // `toggleSkill` is what a click on a cell calls, so a proposal cannot reach a
  // configuration a person could not have reached by hand — the incompatibility
  // rules, the implied skills and the exclusive-category swaps all run exactly
  // as they do for a click, rather than being reimplemented here for a second
  // caller to get subtly wrong.
  const apply = () => {
    for (const skillId of appliedIds) toggleSkill(skillId)
    setAppliedIds([])
    setProposal(null)
  }

  // Three effects: the block leaves, the sentence survives — the visitor is
  // rephrasing rather than starting again, which is also why the openers stay
  // away — and focus returns to the field, because what the visitor was in has
  // just left the DOM and focus must not fall to `<body>`.
  const discard = () => {
    setProposal(null)
    setAppliedIds([])
    const field = fieldRef.current
    if (!field) return
    field.focus()
  }

  return (
    <div
      data-slot="composer-dock"
      // `pointer-events-auto` against the sticky wrapper's `none`, so the strip
      // beside the marketplace button falls through to the grid underneath.
      // The bleed is the gutter VARIABLE and never its value: four separate
      // bugs in this design came from writing the number out, and the prototype
      // itself gets it wrong in two rules while right in five.
      className="pointer-events-auto -mx-gutter mt-[1.625rem] bg-column"
    >
      {/* The dock's ONE conditional child. It is full-bleed on its own — the
          `.res` treatment, the composer's own idiom repeated above it — so
          there is no inset wrapper here for it to sit in. */}
      {proposal && (
        <ProposalBlock
          proposal={proposal}
          onDiscard={discard}
          onApply={apply}
        />
      )}

      <section
        aria-label="Natural-language composer"
        // Hairlines as insets rather than `border-y`, because an inset does not
        // affect box size and cannot accidentally acquire a side. `px-gutter`
        // re-insets the content, so the field's left edge and the button's
        // right edge land on the same content edge the grid and the filter bar
        // use — this is that bar's idiom upside down.
        className="bg-cell px-gutter shadow-[inset_0_1px_0_var(--color-hairline),inset_0_-1px_0_var(--color-hairline)]"
      >
        <textarea
          ref={fieldRef}
          value={draft}
          onChange={(event) => revise(event.target.value)}
          onKeyDown={(event) => {
            if (!isSubmitChord(event)) return
            event.preventDefault()
            void submit()
          }}
          placeholder={PLACEHOLDER}
          aria-label="Composer prompt"
          aria-describedby={hintId}
          // One line at rest. `rows` is ignored wherever `field-sizing` is
          // honoured and is the floor wherever it is not, so it says the same
          // thing either way.
          rows={1}
          // Growth is undesigned, and `field-sizing-content` is one declaration
          // with no JavaScript behind it. Where it is unsupported the field
          // stays at its floor and scrolls — which is exactly the state the
          // design draws, so the degradation is the design rather than a broken
          // variant of it.
          className={`field-sizing-content ${FIELD_HEIGHT_CAP} min-h-[1.1875rem] w-full resize-none overflow-y-auto border-0 bg-transparent p-0 pt-[0.9375rem] text-12_5 leading-[1.5] text-ink outline-none placeholder:text-field-faint focus-visible:ring-1 focus-visible:ring-ring`}
        />

        {/* The control row, and the whole of it: ONE BUTTON, on the column's
            right content edge. The mode track used to sit on its left and the
            hint after that, which is why the row looks like it has room it does
            not have — anything put there is a second control in an action row
            that has one action. */}
        <div className="flex items-center gap-2 pt-[0.5625rem] pb-[0.8125rem]">
          {/* The claim ruling 3 settled, published and not drawn. Both the
              field and the button point at it with `aria-describedby`, because
              a reason goes in the accessible description and never in the name
              — and `sr-only` rather than deleted, because the design removing
              it from the DRAWING is not the design removing it from the
              accessibility tree, where the proposal's own footer is several
              interactions away. */}
          <span id={hintId} data-slot="composer-hint" className="sr-only">
            {HINT}
          </span>

          {/* BLACK, and that is an explicit rejection recorded three times. The
              ghost treatment's only argument was a read-only mode whose press
              changed nothing; there is no mode at all, there is exactly one
              action on this surface, and the proposal's own footer already
              spends both weights correctly — an outlined send button would be
              an outlined affirmative sitting above a black one.

              Composed from `block` rather than given a fifth `Button` variant:
              one call site does not earn a shared variant. What `block` is
              missing is this row's padding, which it has none of because it is
              stretched to the filter bar's height. */}
          <Button
            variant="block"
            className="ml-auto gap-2 px-[0.9375rem] py-[0.5625rem]"
            // Nothing to send, or nothing to send it with: a round trip is a
            // state the composer is IN rather than an instant it passes
            // through, and a button that stays live through one accepts a
            // press it then swallows. The chord is gated by `submit`'s own
            // first line, which is the only door this attribute leaves open.
            disabled={blank || pending}
            aria-keyshortcuts={SEND_KEY_SHORTCUTS}
            aria-describedby={hintId}
            onClick={() => void submit()}
          >
            {SEND_LABEL}{" "}
            <span
              aria-hidden="true"
              className="font-normal tracking-normal text-faint"
            >
              {SEND_CHORD}
            </span>
          </Button>
        </div>
      </section>
    </div>
  )
}
