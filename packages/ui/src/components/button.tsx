import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

// Every button in the design is a square mono block. There are only four, and
// three of them are the same filled ink — filled elements are rare enough that
// the design calls `＋ add skill` "the page's only solid-filled element" in the
// main column, with Install being the roster's equivalent.
//
// No transition: the design animates the filter bar's padding and nothing else.
//
// outline — dialog footer buttons (Close, Cancel)
// primary — the confirming footer button (Add N skills)
// block   — `＋ add skill`, stretched to the filter bar's height
// full    — `Install`, full width in the roster footer
//
// `onDark` is the 84a stuck filter bar: the band around this button is already
// the ink it is filled with, so the fill goes and a hairline takes over —
// leaving it the only bordered thing on the band. Named for the surface rather
// than for the bar's own state, so the primitive never has to know why.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center font-mono font-semibold whitespace-nowrap uppercase outline-none select-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        outline:
          "border border-rule bg-cell px-[0.9375rem] py-[0.625rem] text-9_5 tracking-[.11em] text-ink-3 hover:border-dialog-border hover:text-ink",
        primary:
          "border border-ink bg-ink px-[0.9375rem] py-[0.625rem] text-9_5 tracking-[.11em] text-primary-foreground hover:bg-ink-2",
        block:
          "bg-ink px-[1.125rem] text-9_5 tracking-[.1em] text-primary-foreground hover:bg-ink-2",
        full: "w-full border-0 bg-ink py-[0.6875rem] text-10 tracking-[.12em] text-primary-foreground hover:bg-ink-2",
      },
      onDark: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        variant: "block",
        onDark: true,
        class:
          "bg-transparent shadow-[inset_0_0_0_1px_var(--color-band-edge)] hover:bg-transparent hover:shadow-[inset_0_0_0_1px_var(--color-band-edge-hover)]",
      },
    ],
    defaultVariants: { variant: "outline", onDark: false },
  }
)

function Button({
  className,
  variant = "outline",
  onDark,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, onDark, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
