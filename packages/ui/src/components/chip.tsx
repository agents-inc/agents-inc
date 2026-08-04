import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

// The bordered mono toggle. One idiom at three sizes: `filter` in the filter
// bar (domain + recommended chips), `segment` inside the skill options panel,
// `stage` on the add-skill result rows.
//
// Off is a hairline outline on nothing; on is amber ink on the accent wash
// with an amber border. Hover only firms the border — it never goes amber,
// because amber is reserved for what the user actually chose.
//
// `chipVariants` is exported for the cases that need the look without the
// semantics: the stage marker sits inside an already-clickable row, so it must
// render as a `<span>` rather than nest a button.
//
// `onDark` is the 84a stuck filter bar: the surface turns #242320, so the
// border goes — it is the one thing on the band that keeps none — and the chip
// reads as ink lifted on a translucent white wash instead. Named for the
// surface rather than for the bar's own state, so the primitive never has to
// know why, and so a chip in a dialog can never be caught by it.
const chipVariants = cva(
  "cursor-pointer border font-mono font-medium whitespace-nowrap uppercase",
  {
    variants: {
      size: {
        filter: "px-[0.5625rem] py-[0.375rem] text-9 tracking-[.07em]",
        segment: "flex-1 px-0 py-[0.25rem] text-center text-8 tracking-[.05em]",
        stage: "px-[0.4375rem] py-[0.25rem] text-8 tracking-[.07em]",
      },
      active: {
        true: "border-brand-border bg-wash text-brand-ink",
        false: "bg-transparent text-muted-foreground hover:border-line-hover",
      },
      onDark: {
        true: "border-transparent hover:border-transparent",
        false: "",
      },
    },
    compoundVariants: [
      {
        size: "filter",
        active: false,
        onDark: false,
        class: "border-chip-border",
      },
      {
        size: "segment",
        active: false,
        onDark: false,
        class: "border-divider",
      },
      {
        size: "stage",
        active: false,
        onDark: false,
        class: "border-chip-border",
      },
      {
        active: false,
        onDark: true,
        class:
          "bg-band-chip text-band-dim hover:bg-band-chip-hover hover:text-band-hover",
      },
      { active: true, onDark: true, class: "bg-band-wash text-band-brand" },
    ],
    defaultVariants: { size: "filter", active: false, onDark: false },
  }
)

function Chip({
  className,
  size,
  active,
  onDark,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof chipVariants>) {
  return (
    <button
      type={type}
      data-slot="chip"
      aria-pressed={active ?? false}
      className={cn(chipVariants({ size, active, onDark }), className)}
      {...props}
    />
  )
}

export { Chip, chipVariants }
