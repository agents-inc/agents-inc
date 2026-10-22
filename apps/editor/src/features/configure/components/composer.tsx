import { Button } from "@workspace/ui/components/button"
import { Glyph } from "@workspace/ui/components/glyph"
import { useId, useLayoutEffect, useRef, useState } from "react"

import { composeProposal, type ComposeRefusal } from "@/lib/api/compose"
import { groupsFor } from "../lib/compose-proposal"
import { useScrollClearance } from "../lib/use-scroll-clearance"
import { useAccountStore } from "@/stores/account-store"
import { useCatalogStore } from "@/stores/catalog-store"
import { useConfigStore } from "@/stores/config-store"

import { ProposalBlock } from "./proposal"

import type { Proposal } from "./proposal"
import type { CSSProperties, KeyboardEvent } from "react"

const PLACEHOLDER =
  "Describe a stack, change what is selected, or ask how something works…"

const SEND_LABEL = "Send"

// Not drawn; reaches the accessible description only.
const HINT = "nothing changes until you apply"

// One chord is drawn; both are bound on every platform.
const IS_APPLE_PLATFORM = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
const SEND_MODIFIER = IS_APPLE_PLATFORM ? "⌘" : "Ctrl"

const SEND_KEY_SHORTCUTS = "Meta+Enter Control+Enter"

// A plain `Enter` inserts a newline.
const isSubmitChord = (event: KeyboardEvent<HTMLTextAreaElement>) =>
  event.key === "Enter" && (event.metaKey || event.ctrlKey)

// Carries both paddings because `max-height` is border-box. The whole class
// is a literal: Tailwind cannot see an interpolated figure.
const FIELD_HEIGHT_CAP = "max-h-[calc(0.9375rem+7.125rem+var(--composer-tail))]"

// `too-long` names no number: only the worker knows the cap.
const REFUSAL_COPY: Record<ComposeRefusal, string> = {
  "signed-out": "Your session ended. Sign in again — nothing changed.",
  "too-many": "Too many requests in a minute. Try again shortly.",
  "too-long": "That is too long to send. Shorten it and try again.",
  refused: "The model did not answer. Nothing changed.",
  unreachable: "Could not reach the composer. Nothing changed.",
}

// Answered locally: the route is signed-in only.
const SIGNED_OUT_REASON = "Sign in to use the composer — nothing was sent."

const THINKING_REASON = "Choosing skills…"

export function Composer() {
  const [draft, setDraft] = useState("")
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [pending, setPending] = useState(false)
  // Kept beside the proposal: its rows carry display names, `toggleSkills` takes ids.
  const [appliedIds, setAppliedIds] = useState<string[]>([])
  const skillById = useCatalogStore((state) => state.skillById)
  const selected = useConfigStore((state) => state.skills)
  const toggleSkills = useConfigStore((state) => state.toggleSkills)
  const account = useAccountStore((state) => state.session)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const hintId = useId()

  // The control row's height, measured: the `⌘` fallback font sets it, so no
  // constant holds. The field reserves it as bottom padding.
  const tailRef = useRef<HTMLDivElement>(null)
  const [tail, setTail] = useState(0)

  const dockRef = useRef<HTMLDivElement>(null)

  // Annotated, not cast, so the custom property name is checked.
  const bandStyle: CSSProperties & Record<"--composer-tail", string> = {
    "--composer-tail": `${tail}px`,
  }

  useLayoutEffect(() => {
    const row = tailRef.current
    if (!row) return

    // Border box: `contentRect` would omit the row's padding.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setTail(entry.target.getBoundingClientRect().height)
    })
    observer.observe(row)
    return () => observer.disconnect()
  }, [])

  useScrollClearance(dockRef, "bottom")

  const blank = draft.trim() === ""

  // Read off the ref: the answer's closure captured the draft at the press.
  const stillAsked = (sentence: string) =>
    !fieldRef.current || fieldRef.current.value === sentence

  // Editing the sentence voids any answer, including one still in flight.
  const revise = (next: string) => {
    setDraft(next)
    setProposal(null)
    setAppliedIds([])
    setPending(false)
  }

  const submit = async () => {
    if (blank || pending) return

    const sentence = draft
    if (!account)
      return setProposal({ sentence, groups: [], reason: SIGNED_OUT_REASON })

    // Before disabling the button, or focus drops to `<body>`.
    fieldRef.current?.focus()
    setPending(true)
    setProposal({
      sentence,
      groups: [],
      reason: THINKING_REASON,
      pending: true,
    })

    const result = await composeProposal(sentence)

    // Drop a stale answer before touching `pending`, which may belong to a
    // newer request.
    if (!stillAsked(sentence)) return
    setPending(false)

    if (!result.ok)
      return setProposal({
        sentence,
        groups: [],
        reason: REFUSAL_COPY[result.refusal],
      })

    // One derivation for both rows and ids, so the block shows what Apply does.
    const { groups, ids } = groupsFor(
      result.proposal.skillIds,
      skillById,
      selected
    )
    setAppliedIds(ids)
    setProposal({ sentence, groups, reason: result.proposal.reason })
  }

  // Through the same toggle a click runs, so every rule applies here too.
  const apply = () => {
    toggleSkills(appliedIds)
    setAppliedIds([])
    setProposal(null)
  }

  // Keeps the sentence; refocuses the field so focus doesn't fall to `<body>`.
  const discard = () => {
    setProposal(null)
    setAppliedIds([])
    fieldRef.current?.focus()
  }

  return (
    <div
      ref={dockRef}
      data-slot="composer-dock"
      // Re-enables pointer events the sticky wrapper turns off.
      className="pointer-events-auto -mx-gutter mt-[1.625rem] bg-column"
    >
      {proposal && (
        <ProposalBlock
          proposal={proposal}
          onDiscard={discard}
          onApply={apply}
        />
      )}

      <section
        aria-label="Natural-language composer"
        // No padding: every inset belongs to the field, so a press anywhere in
        // the band takes the caret. `relative` positions the control row.
        style={bandStyle}
        className="relative bg-cell shadow-[inset_0_1px_0_var(--color-hairline),inset_0_-1px_0_var(--color-hairline)]"
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
          rows={1}
          // Where `field-sizing` is unsupported the field stays one line and
          // scrolls. `pb` reserves the measured control row drawn over its
          // foot; `block` avoids the inline line box's descender gap.
          className={`field-sizing-content ${FIELD_HEIGHT_CAP} block min-h-[1.1875rem] w-full resize-none overflow-y-auto border-0 bg-transparent p-0 px-gutter pt-[0.9375rem] pb-[var(--composer-tail)] text-12_5 leading-[1.5] text-ink outline-none placeholder:text-field-faint focus-visible:ring-1 focus-visible:ring-ring`}
        />

        {/* Absolute, since the field's padding is measured from it;
            `pointer-events-none` lets presses beside the button reach the field. */}
        <div
          ref={tailRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 px-gutter pt-[0.5625rem] pb-[0.8125rem]"
        >
          <span id={hintId} data-slot="composer-hint" className="sr-only">
            {HINT}
          </span>

          <Button
            variant="block"
            className="pointer-events-auto ml-auto gap-2 px-[0.9375rem] py-[0.5625rem]"
            disabled={blank || pending}
            aria-keyshortcuts={SEND_KEY_SHORTCUTS}
            aria-describedby={hintId}
            onClick={() => void submit()}
          >
            {SEND_LABEL}
            <span
              aria-hidden="true"
              className="flex items-center gap-[0.1875rem] font-normal tracking-normal text-faint"
            >
              {SEND_MODIFIER}
              <Glyph name="enter" size={12} />
            </span>
          </Button>
        </div>
      </section>
    </div>
  )
}
