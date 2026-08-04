import type { ComponentProps } from "react"

import { Chip } from "@workspace/ui/components/chip"
import { cn } from "@workspace/ui/lib/utils"

// A row of mutually-exclusive chips — Install mode and Install scope inside
// the skill options panel. Sections are separated by whitespace only; the
// design uses no rules inside the panel.
//
// The 10px inline padding is the panel's own gutter, carried here so the call
// sites stay declarative.
function Segmented({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="segmented"
      role="group"
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
  return <Chip size="segment" active={active} {...props} />
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
