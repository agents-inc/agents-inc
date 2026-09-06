import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

// Both search fields in the design are borderless — the border belongs to the
// bar or field wrapping them, so the input itself contributes only type.
//
// THE BORDER IS THE WRAPPER'S AND THE PADDING IS NOT. That is the half this
// said nothing about until 2026-09-05, and all three wrappers had taken the
// padding as well — so between the border a visitor sees and the text they read
// sat a ring belonging to neither, on the field's own fill, inside the field's
// own border, dead to a click. The field was a strip in the middle of its box.
// `p-0` below is the DEFAULT a bare field starts from, not a rule: a wrapper
// hands its inset down through `className` and the field's box then fills the
// border it is drawn inside, which is what makes every pixel of that box take
// the caret at the point it was pressed.
//
// The figures stay at the call sites because they are the boxes' rather than
// this component's — 15px in the filter bar against 12px in the dialogs, and
// the bar's swaps for a single gutter and animates when the bar pins. A box
// that cannot give its padding away because something else is standing in it —
// `add-skill-dialog.tsx`, whose border holds a glyph and a caret bar either
// side of the field — is a `<label>`, so its decorations' own area reaches the
// field too. `e2e/specs/field-hit-area.spec.ts` is what holds all of this: it
// presses each corner of each drawn box and asks what has the caret, which is
// the only question a padding rule cannot be satisfied without answering.
//
// The focus ring is the field's own, in the cva base beside the `outline-none`
// it answers: every render of these variants dresses an `<input>`, so there is
// no passive form to keep it off. It read as the wrapper's job until
// 2026-08-09 and no wrapper ever took it — nor could the filter bar's, which
// holds six chips that each draw this ring already, so a `focus-within` there
// would mark the whole row every time one of them was pressed.
//
// `onDark` is the 84a stuck filter bar: the surface under this input turns
// #242320 and the type has to invert with it. Named for the surface rather
// than for the bar's own state, so the primitive never has to know why.
const inputVariants = cva(
  "min-w-0 flex-1 border-0 bg-transparent p-0 font-mono font-normal outline-none focus-visible:ring-1 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        // The filter bar.
        search: "text-15",
        // The add-skill dialog's GitHub search.
        dialog: "text-13 text-ink placeholder:text-faint",
      },
      onDark: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        variant: "search",
        onDark: false,
        // A typed query is a decision the visitor made and the prompt is not,
        // so the two are not the same grey. The stuck arm below already draws
        // them apart; this one rendered both at #6a675c.
        class: "text-ink placeholder:text-subtle",
      },
      {
        variant: "search",
        onDark: true,
        class: "text-band-ink caret-band-brand placeholder:text-band-faint",
      },
    ],
    defaultVariants: { variant: "search", onDark: false },
  }
)

function Input({
  className,
  variant,
  onDark,
  type = "text",
  ...props
}: ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant, onDark }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
