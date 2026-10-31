import { Button } from "@workspace/ui/components/button"
import { Glyph } from "@workspace/ui/components/glyph"
import { useId } from "react"

// A reviewable changeset: nothing applies until `Apply` is pressed. A rendering
// contract, not a wire one; `lib/compose-proposal.ts` maps the model onto it.

export type ProposalRow = {
  name: string
  // `preloaded`, `sonnet · med`, or a transition — `lazy → preloaded`.
  state: string
  // Whether `state`, or its `after` half, is the non-default choice.
  amber: boolean
  added: boolean
}

export type ProposalGroup = {
  subject: "Skills" | "Sub-agents"
  verb: "added" | "changed"
  rows: ProposalRow[]
}

export type Proposal = {
  // Empty `groups` while pending means "not yet", not "no changes".
  pending?: boolean
  // The submitted sentence, not the live draft.
  sentence: string
  groups: ProposalGroup[]
  reason: string | null
}

const OPEN_QUOTE = "“"
const CLOSE_QUOTE = "”"

const SEPARATOR = " · "

const NO_CHANGES = "no changes"

const CHANGE_LIST_NAME = "Proposed changes"

// Capped, or the sticky dock would cover the page. A whole utility: Tailwind
// cannot read an interpolated class.
const PROPOSAL_HEIGHT_CAP = "max-h-[21rem]"

const headingOf = ({ subject, verb, rows }: ProposalGroup) =>
  `${subject}${SEPARATOR}${rows.length} ${verb}`

const totalOf = (groups: ProposalGroup[]) =>
  groups.reduce((count, group) => count + group.rows.length, 0)

const totalLabel = (total: number) => {
  if (total === 0) return NO_CHANGES

  return `${total} ${total === 1 ? "change" : "changes"}`
}

function Row({ row }: { row: ProposalRow }) {
  return (
    <div
      data-slot="proposal-row"
      className="flex h-[1.375rem] items-baseline gap-2"
    >
      {/* Always drawn, so every name starts on the same x. */}
      <span className="flex w-[0.625rem] flex-none justify-center self-center text-brand">
        {row.added && <Glyph name="plus" size={11} />}
      </span>
      {/* Truncated: a wrapped name breaks the columns' row rhythm. */}
      <span className="truncate text-12 font-normal text-ink">{row.name}</span>
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
      // No negative margin: the dock already bleeds. A flex column, so a capped
      // block scrolls the body and keeps the footer's actions.
      className={`mb-[1.625rem] flex ${PROPOSAL_HEIGHT_CAP} flex-col bg-cell shadow-[inset_0_1px_0_var(--color-hairline),inset_0_-1px_0_var(--color-hairline)]`}
    >
      {/* On the header, not the block: a live region announces its whole
          subtree. `status`, as `main`'s one `alert` is the import notice. */}
      <div
        role="status"
        className="flex shrink-0 items-baseline px-gutter py-[1.125rem]"
      >
        <span className="max-w-[86ch] text-12_5 leading-[1.5] font-normal text-pretty text-ink-2">
          {OPEN_QUOTE}
          {proposal.sentence}
          {CLOSE_QUOTE}
        </span>
        {/* Silent while pending, or the live region announces a false zero. */}
        {!proposal.pending && (
          <span className="ml-auto pl-8 font-mono text-8_5 font-normal whitespace-nowrap text-roster-off">
            {totalLabel(total)}
          </span>
        )}
      </div>

      {/* Its rows hold nothing to focus, so the list is what the keyboard
          scrolls once the cap is reached. */}
      {proposal.groups.length > 0 && (
        <div
          role="region"
          aria-label={CHANGE_LIST_NAME}
          tabIndex={0}
          className="min-h-0 overflow-y-auto px-gutter pt-[0.875rem] pb-[1.125rem] shadow-[inset_0_1px_0_var(--color-tree-border)] outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {proposal.groups.map((group, index) => (
            <div
              key={headingOf(group)}
              role="group"
              aria-labelledby={`${groupIds}-${index}`}
            >
              {/* An index test: the wrappers leave no adjacency to select. */}
              <p
                id={`${groupIds}-${index}`}
                className={`mb-[0.5625rem] font-mono text-8_5 font-semibold tracking-[.12em] text-muted-foreground uppercase ${index > 0 ? "mt-[0.875rem]" : ""}`}
              >
                {headingOf(group)}
              </p>
              {/* Four columns keep each load word near its name. */}
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
          <span
            data-slot="proposal-reason"
            className="min-w-0 font-mono text-10 leading-[1.5] font-normal text-muted-foreground"
          >
            {proposal.reason}
          </span>
        )}
        {/* `ml-auto` here, so the buttons stay right with no reason line. */}
        <div className="ml-auto flex items-center gap-[0.5625rem]">
          <Button
            variant="outline"
            aria-label="Discard proposal"
            onClick={onDiscard}
          >
            Discard
          </Button>
          {/* Disabled rather than absent, so the footer keeps its shape. */}
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
