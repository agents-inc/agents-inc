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
 * NOTCHED INTO THE GRID, exactly as the composer under it is: full-bleed
 * across the column, hairlines top and bottom only, no side borders and no drop
 * shadow. It was a bordered card inset to the content edge for one revision,
 * and a card floated over the column is the treatment nine other float
 * explorations were rejected in favour of not being.
 *
 * `Configurator v5.dc.html`'s `.res` block is the source for every figure here.
 * Two things it does not draw are designed on top of it: a CHANGED row, whose
 * mark track is empty and whose state track holds `<before> → <after>`, and the
 * ZERO-CHANGE form below, which is what a refusal and an empty answer both
 * render as.
 *
 * The shape below is a RENDERING contract and not a wire one. The model returns
 * skill ids and a sentence; `lib/compose-proposal.ts` maps those onto this, and
 * `verb: "changed"` has no producer yet because the model is not allowed to
 * propose an assignment.
 */

/** One changed or added thing. Rows are text: the design draws no per-row
 *  control — the block's two verbs act on all of it or on none. */
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

// U+201C and U+201D, and they are CONTENT rather than a `::before` rule — the
// design's own markup carries them around the sentence.
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
// eventually cover the page it is docked to. The design's own eleven-row block
// is four columns of three, so this is headroom rather than a crop of it.
//
// The whole constant is the utility, not its number: Tailwind reads class
// strings out of the source, so a figure interpolated into one compiles to
// nothing at all — no build error, no lint error, just an uncapped block.
const PROPOSAL_HEIGHT_CAP = "max-h-[21rem]"

// The design writes the verb into the heading rather than onto the rows —
// `Skills · 11 added` — which generalises to a changed group with no new
// mechanism: `Skills · 4 changed`.
const headingOf = ({ subject, verb, rows }: ProposalGroup) =>
  `${subject}${SEPARATOR}${rows.length} ${verb}`

// The row count, exactly as the design's fixture computes it (`propSk.length +
// propAg.length`). That arithmetic is what makes one row per changed FIELD the
// right shape: `4 changes` then means four things moved.
const totalOf = (groups: ProposalGroup[]) =>
  groups.reduce((count, group) => count + group.rows.length, 0)

// The design's template is `<n> + ' changes'` for every count — so the singular
// is deliberately not invented here, and the plural is the design's own.
const totalLabel = (total: number) =>
  total === 0 ? NO_CHANGES : `${total} changes`

// One row, and the load word is pushed to the right edge of ITS OWN COLUMN
// rather than the block's. At 1352px a two-column layout put names at x=190 and
// load words at x=1400 — nothing pairs them across 1200px of paper.
function Row({ row }: { row: ProposalRow }) {
  return (
    <div
      data-slot="proposal-row"
      className="flex h-[1.375rem] items-baseline gap-2"
    >
      <span
        aria-hidden="true"
        className="flex-none font-mono text-10 font-normal text-brand"
      >
        {row.added ? ADDED_MARK : ""}
      </span>
      {/* Truncated rather than wrapped: a name that wraps takes the row off its
          22px rhythm and the four columns stop lining up across the block. */}
      <span className="truncate text-12 font-normal text-ink">{row.name}</span>
      {/* Amber marks what the visitor is CHOOSING and never decorates: the
          load word is amber for `preloaded` and grey for `lazy`, and on a
          transition it is the `after` half that carries it. */}
      <span
        className={`ml-auto flex-none font-mono text-9 font-normal whitespace-nowrap ${row.amber ? "text-brand-ink" : "text-faint"}`}
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
      // FULL-BLEED, hairlines top and bottom only, no radius and no drop
      // shadow: the only drop shadow in this design is on a modal dialog, and
      // this is a ROW OF THE COLUMN rather than a card over it.
      //
      // NO NEGATIVE MARGIN OF ITS OWN. The dock this sits in is already bled
      // out to the column's edges, so a second `-mx-gutter` here bleeds twice
      // — measured at 1234px against the band's 1102px, one gutter past the
      // column on each side. The bleed belongs to the dock; what belongs here
      // is re-insetting the content to the same edge the band's does.
      //
      // `mb` rather than `mt` because the dock's own top margin is already
      // above this. The column is a flex one so the footer can hold: it
      // carries the only two actions, so capping the block has to scroll the
      // body past them rather than scroll them away.
      className={`mb-[1.625rem] flex ${PROPOSAL_HEIGHT_CAP} flex-col bg-cell shadow-[inset_0_1px_0_var(--color-hairline),inset_0_-1px_0_var(--color-hairline)]`}
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
        className="flex shrink-0 items-baseline px-gutter py-[1.125rem]"
      >
        {/* PROSE, in Inter — it is the line that explains the whole proposal,
            and mono at 11.5px read as a log entry. The quotes stay: this is a
            quotation of what the visitor asked for, not the model's own
            summary, and `max-w-[86ch]` is what keeps it a paragraph rather
            than one line across a 1200px column. */}
        <span className="max-w-[86ch] text-12_5 leading-[1.5] font-normal text-pretty text-ink-2">
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
          <span className="ml-auto pl-8 font-mono text-8_5 font-normal whitespace-nowrap text-roster-off">
            {totalLabel(total)}
          </span>
        )}
      </div>

      {/* Absent entirely when there is nothing to enumerate, rule included: an
          empty bordered box is furniture. `tree-border` is the preview dialog's
          pane rule doing a second duty here, splitting header from body. */}
      {proposal.groups.length > 0 && (
        <div className="min-h-0 overflow-y-auto px-gutter pt-[0.875rem] pb-[1.125rem] shadow-[inset_0_1px_0_var(--color-tree-border)]">
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
                className={`mb-[0.5625rem] font-mono text-8_5 font-semibold tracking-[.12em] text-muted-foreground uppercase ${index > 0 ? "mt-[0.875rem]" : ""}`}
              >
                {headingOf(group)}
              </p>
              {/* FOUR COLUMNS. Two put names at x=190 and their load words at
                  x=1400 on a 1352px column — nothing pairs across 1200px of
                  paper — and the column gap is what makes each row's own right
                  edge close enough to its name to read as one thing. */}
              <div className="grid grid-cols-4 gap-x-[2.125rem]">
                {group.rows.map((row) => (
                  <Row key={`${row.name} ${row.state}`} row={row} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2.5 px-gutter pt-3 pb-[0.875rem] shadow-[inset_0_1px_0_var(--color-tree-border)]">
        {proposal.reason !== null && (
          // It must not be the faintest thing in the block: it is the argument
          // for having a proposal at all.
          <span
            data-slot="proposal-reason"
            className="min-w-0 font-mono text-10 leading-[1.5] font-normal text-muted-foreground"
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
