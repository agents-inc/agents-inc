import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

// Both search fields in the design are borderless — the border belongs to the
// bar or field wrapping them, so the input itself contributes only type.
//
// The focus ring is the field's own, in the cva base beside the `outline-none`
// it answers: every render of these variants dresses an `<input>`, so there is
// no passive form to keep it off. It read as the wrapper's job until
// 2026-08-09 and no wrapper ever took it — nor could the filter bar's, which
// holds six chips that each draw this ring already, so a `focus-within` there
// would mark the whole row every time one of them was pressed. The bar also
// moves focus into this field by itself as it sticks, and what receives focus
// is what has to show it.
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
        class: "text-subtle placeholder:text-subtle",
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
