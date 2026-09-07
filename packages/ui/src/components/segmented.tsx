import type { ComponentProps } from "react"

import { Chip } from "@workspace/ui/components/chip"
import { moveToAdjacentRadio } from "@workspace/ui/lib/radio-row"
import { cn } from "@workspace/ui/lib/utils"

// A row of mutually-exclusive chips — Install mode and Install scope inside
// the skill options panel. Sections are separated by whitespace only; the
// design uses no rules inside the panel.
//
// The 10px inline padding is the panel's own gutter, carried here so the call
// sites stay declarative.
//
// Mutually exclusive is a claim about the row, so the row is a radiogroup and
// its segments are radios: one choice with several options, rather than several
// independent toggles one of which happens to be on. Both call sites hold the
// row in a single store field, so that is the truth about them — and it is what
// buys the row one tab stop instead of one per segment.
function Segmented({ className, onKeyDown, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="segmented"
      role="radiogroup"
      onKeyDown={(event) => {
        onKeyDown?.(event)
        moveToAdjacentRadio(event)
      }}
      className={cn(
        "flex gap-[0.125rem] px-[0.625rem] pb-[0.125rem]",
        className
      )}
      {...props}
    />
  )
}

function SegmentedItem({
  active,
  ...props
}: ComponentProps<typeof Chip> & { active?: boolean }) {
  return (
    <Chip
      size="segment"
      active={active}
      role="radio"
      aria-checked={active ?? false}
      // A Chip is a toggle by default, and a radio is not pressed — it is
      // checked, and `aria-pressed` is not an attribute the role admits.
      // `undefined` is what stops React rendering the one Chip supplies.
      aria-pressed={undefined}
      // Roving tabindex: the active segment is the row's tab stop, and the
      // arrow keys above do the moving from there.
      tabIndex={active ? 0 : -1}
      {...props}
    />
  )
}

// The uppercase mono caption above a segmented row (`.c2h`).
function FieldLabel({
  className,
  first = false,
  ...props
}: ComponentProps<"div"> & { first?: boolean }) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "px-[0.625rem] pb-[0.25rem] font-mono text-7_5 font-semibold tracking-[.12em] text-muted-foreground uppercase",
        first ? "pt-[0.375rem]" : "pt-[0.6875rem]",
        className
      )}
      {...props}
    />
  )
}

export { FieldLabel, Segmented, SegmentedItem }
