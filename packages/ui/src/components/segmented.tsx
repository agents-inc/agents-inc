import type { ComponentProps } from "react"

import { Chip } from "@workspace/ui/components/chip"
import { moveToAdjacentRadio } from "@workspace/ui/lib/radio-row"
import { cn } from "@workspace/ui/lib/utils"

// A radiogroup with one tab stop: both call sites hold the row in a single store field.
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
      // A radio is checked, not pressed; `undefined` drops the attribute Chip supplies.
      aria-pressed={undefined}
      // Roving tabindex.
      tabIndex={active ? 0 : -1}
      {...props}
    />
  )
}

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
