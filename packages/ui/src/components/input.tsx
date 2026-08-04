import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

// Both search fields in the design are borderless — the border belongs to the
// bar or field wrapping them, so the input itself contributes only type. That
// keeps the wrapper free to own focus and hover states for the whole row.
//
// `onDark` is the 84a stuck filter bar: the surface under this input turns
// #242320 and the type has to invert with it. Named for the surface rather
// than for the bar's own state, so the primitive never has to know why.
const inputVariants = cva(
  "min-w-0 flex-1 border-0 bg-transparent p-0 font-mono font-normal outline-none",
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
