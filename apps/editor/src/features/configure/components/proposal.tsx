import { Button } from "@workspace/ui/components/button"
import { useId } from "react"

/**
 * WHAT A SUBMIT ANSWERS WITH: A REVIEWABLE CHANGESET, NOT A SILENT MUTATION.
 *
 * Owner ruling, 2026-08-26: a proposal is ALWAYS shown before anything is
 * applied. That settled what the design folder called the biggest open item in
 * the whole composer, and it is why this block is Phase C's work rather than
 * the model's — nothing is applied until `Apply` is pressed, and neither
 * the submit nor the `Discard` is that press.
 *
 * `Chat Composer Lab.dc.html` option `91g` is the only drawing of a proposal
 * that exists anywhere, so it is the source for every figure here. Two things
 * it does not draw are designed on top of it: a CHANGED row, whose mark track
 * is empty and whose state track holds `<before> → <after>`, and the ZERO-CHANGE
 * form below, which is what a refusal and an empty answer both render as.
 *
 * The shape below is a RENDERING contract and not a wire one. The model returns
 * skill ids and a sentence; `lib/compose-proposal.ts` maps those onto this, and
 * `verb: "changed"` has no producer yet because the model is not allowed to
 * propose an assignment.
 */

/** One changed or added thing. Rows are text: `91g` draws no per-row control. */
export type ProposalRow = {
  name: string
  /** `preloaded`, `sonnet · med`, or a transition — `lazy → preloaded`. */
  state: string
  /** Whether `state` — or its `after` half — is the non-default choice. */
  amber: boolean
  /** Whether the mark track draws the amber `＋`. A changed row draws none. */
  added: boolean
}

export type ProposalGroup = {
  subject: "Skills" | "Sub-agents"
  verb: "added" | "changed"
  rows: ProposalRow[]
}

export type Proposal = {
  /** Nothing has come back yet. The block is drawn, and it must not claim a
   *  count it does not have — `groups` is empty while waiting, and reading that
   *  as "no changes" announces an answer through a live region before anything
   *  was asked. */
  pending?: boolean
  /** The SUBMITTED sentence, echoed. Not the live draft, which goes on being
   *  editable underneath — which is also why editing it clears the proposal
   *  rather than rewriting this. */
  sentence: string
  groups: ProposalGroup[]
  /** The `.dfn` line in the footer. */
  reason: string | null
}

// U+201C and U+201D, and they are CONTENT rather than a `::before` rule —
// `91g`'s own markup carries them around the sentence.
const OPEN_QUOTE = "“"
const CLOSE_QUOTE = "”"

// The app's existing joiner, U+00B7 with a space either side — the same one
// `Marketplace · <name>` uses on the button a few pixels below this block.
const SEPARATOR = " · "

// U+FF0B FULLWIDTH PLUS SIGN, as `＋ Add skill` on the filter bar uses. Amber
// because it marks what the visitor gets, and `aria-hidden` because seven
// repetitions of "fullwidth plus sign" before seven names is what happens
// otherwise.
const ADDED_MARK = "＋"

// The design's template is `<n> + ' changes'`, which yields `0 changes` — a
// string that reads as a broken template rather than as an answer. NEW copy,
// and one of only two strings in this phase verified against nothing.
const NO_CHANGES = "no changes"

// The dock is sticky at the viewport's foot, so an uncapped proposal would
// eventually cover the page it is docked to. `91g`'s own ten-change block is
// around 15rem, so this is headroom rather than a crop of the drawn case.
//
// The whole constant is the utility, not its number: Tailwind reads class
// strings out of the source, so a figure interpolated into one compiles to
// nothing at all — no build error, no lint error, just an uncapped block.
const PROPOSAL_HEIGHT_CAP = "max-h-[21rem]"

// `91g` writes the verb into the heading rather than onto the rows, which
// generalises to a changed group with no new mechanism: `Skills · 4 changed`.
const headingOf = ({ subject, verb, rows }: ProposalGroup) =>
  `${subject}${SEPARATOR}${rows.length} ${verb}`

// The row count, exactly as `91g`'s fixture computes it (`propSk.length +
// propAg.length`). That arithmetic is what makes one row per changed FIELD the
// right shape: `4 changes` then means four things moved.
const totalOf = (groups: ProposalGroup[]) =>
  groups.reduce((count, group) => count + group.rows.length, 0)

// The design's template is `<n> + ' changes'` for every count — so the singular
// is deliberately not invented here, and the plural is `91g`'s own.
const totalLabel = (total: number) =>
  total === 0 ? NO_CHANGES : `${total} changes`

function Row({ row }: { row: ProposalRow }) {
  return (
    <div className="grid h-[1.1875rem] grid-cols-[0.875rem_1fr_auto] items-baseline">
      <span
        aria-hidden="true"
        className="font-mono text-10 font-normal text-brand"
      >
        {row.added ? ADDED_MARK : ""}
      </span>
      <span className="text-11 font-normal text-ink">{row.name}</span>
      {/* Amber marks what the visitor is CHOOSING and never decorates: the
          load word is amber for `preloaded` and grey for `lazy`, and on a
          transition it is the `after` half that carries it. */}
      <span
        className={`font-mono text-8_5 font-normal ${row.amber ? "text-brand-ink" : "text-faint"}`}
      >
        {row.state}
      </span>
    </div>
  )
}

export function ProposalBlock({
  proposal,
  onDiscard,
  onApply,
}: {
  proposal: Proposal
  onDiscard: () => void
  onApply: () => void
}) {
  const groupIds = useId()
  const total = totalOf(proposal.groups)

  return (
    <section
      aria-label="Proposal"
      // No radius and no drop shadow: the only drop shadow in this design is on
      // a modal dialog, and this is a block in the column rather than one over
      // it. `.prf{flex:none}` is why the column is a flex one — the footer holds
      // the only two actions, so capping the block has to scroll the body past
      // them rather than scroll them away.
      className={`flex ${PROPOSAL_HEIGHT_CAP} flex-col bg-cell shadow-[inset_0_0_0_1px_var(--color-hairline)]`}
    >
      {/* `status` rather than `alert`: nothing went wrong, so it should wait
          for a pause rather than interrupt. And it is on the HEADER rather than
          on the block — a live region announces its whole subtree on change,
          which would make `Discard` and `Apply` part of the announcement.
          Mechanically it also has to be `status`, because `ConfigurePage`'s
          import notice is `main`'s only `alert` and a second one would make
          that locator ambiguous under Playwright's strict mode. */}
      <div
        role="status"
        className="flex shrink-0 items-baseline px-[0.9375rem] pt-[0.8125rem] pb-[0.6875rem]"
      >
        <span className="text-11_5 font-normal text-matrix-ink italic">
          {OPEN_QUOTE}
          {proposal.sentence}
          {CLOSE_QUOTE}
        </span>
        {/* Silent while waiting. An empty `groups` means "not yet", not "no
            changes", and this sits inside the `status` region — so drawing the
            zero-count label here announced an answer to the reader of a screen
            reader before the request had even returned, then announced a second
            time when it did. */}
        {!proposal.pending && (
          <span className="ml-auto font-mono text-8_5 font-normal text-roster-off">
            {totalLabel(total)}
          </span>
        )}
      </div>

      {/* Absent entirely when there is nothing to enumerate, rule included: an
          empty bordered box is furniture. `tree-border` is the preview dialog's
          pane rule doing a second duty here, splitting header from body. */}
      {proposal.groups.length > 0 && (
        <div className="min-h-0 overflow-y-auto border-t border-tree-border px-[0.9375rem] pt-[0.75rem] pb-[0.875rem]">
          {proposal.groups.map((group, index) => (
            <div
              key={headingOf(group)}
              role="group"
              aria-labelledby={`${groupIds}-${index}`}
            >
              {/* `.prg+.prg{margin-top:14px}` in the design, written as an
                  index test because each group is wrapped to carry its own
                  `role` and there is no adjacency left for the selector. */}
              <p
                id={`${groupIds}-${index}`}
                className={`mb-[0.375rem] font-mono text-8_5 font-semibold tracking-[.1em] text-faint uppercase ${index > 0 ? "mt-[0.875rem]" : ""}`}
              >
                {headingOf(group)}
              </p>
              {group.rows.map((row) => (
                <Row key={`${row.name} ${row.state}`} row={row} />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-[0.5625rem] border-t border-hairline px-[1.25rem] py-[0.8125rem]">
        {proposal.reason !== null && (
          <span
            data-slot="proposal-reason"
            className="min-w-0 font-mono text-10 font-normal text-muted-foreground"
          >
            {proposal.reason}
          </span>
        )}
        {/* The pair carries the `ml-auto` rather than the reason line carrying
            `mr-auto` as `.dfn` does, so the buttons still sit on the right edge
            of a proposal that has no reason to give. */}
        <div className="ml-auto flex items-center gap-[0.5625rem]">
          {/* The visible labels are `91g`'s; the accessible names say what is
              applied and what is discarded, which is how this codebase names
              controls (`Remove ${name}`, `Contents of ${displayName}`). */}
          <Button
            variant="outline"
            aria-label="Discard proposal"
            onClick={onDiscard}
          >
            Discard
          </Button>
          {/* Disabled whenever a proposal carries zero changes — a general
              rule rather than a phase carve-out, and the model answering with
              nothing to do is one of the ways a proposal gets there. Disabled
              rather than absent, because a footer that grows a button between
              one proposal and the next is a layout changing shape for a reason
              nobody can see.

              `onApply` selects the proposed skills and nothing else — the
              scope, the install mode and which sub-agents carry them are the
              app's own rules, applied the same way a click on a cell applies
              them. */}
          <Button
            variant="primary"
            aria-label="Apply proposal"
            disabled={total === 0}
            onClick={onApply}
          >
            Apply
          </Button>
        </div>
      </div>
    </section>
  )
}
