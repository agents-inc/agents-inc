import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

// Hover only firms the border: amber is reserved for what the user chose. `chipVariants` is
// exported for a passive `<span>` inside a clickable row.
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
      // Focus ring here, not in the cva: `chipVariants` also dresses a passive `<span>`.
      className={cn(
        chipVariants({ size, active, onDark }),
        "outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
  )
}

export { Chip, chipVariants }
