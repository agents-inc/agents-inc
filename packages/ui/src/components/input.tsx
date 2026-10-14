import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

// Borderless: the border is the wrapper's, the padding the field's own. `p-0`
// is only the default; a wrapper hands its inset down through `className` so
// every pixel inside its border takes the caret (`field-hit-area.spec.ts`).
// `onDark` is the stuck filter bar's dark band.
const inputVariants = cva(
  "min-w-0 flex-1 border-0 bg-transparent p-0 font-mono font-normal outline-none focus-visible:ring-1 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        search: "text-13_5",
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
