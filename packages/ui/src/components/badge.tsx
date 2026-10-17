import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

// `state` goes amber (`alt`) when it holds a non-default value. Render as a `<button>` via
// `render` when interactive, and stop the cell's click handler from also firing.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center font-mono whitespace-nowrap uppercase",
  {
    variants: {
      variant: {
        state:
          "bg-badge px-[0.3125rem] py-[0.1875rem] text-8 font-medium tracking-[.06em] text-muted-foreground",
        tag: "bg-wash px-[0.25rem] py-[0.0625rem] text-8 font-medium tracking-[.06em] text-brand-ink",
        outline:
          "border border-chip-border px-[0.3125rem] py-[0.0625rem] text-8 font-medium tracking-[.04em] text-muted-foreground",
      },
      alt: { true: "", false: "" },
      interactive: { true: "cursor-pointer", false: "" },
    },
    compoundVariants: [
      {
        variant: "state",
        alt: true,
        class: "bg-wash text-brand-ink",
      },
      {
        variant: "state",
        interactive: true,
        class:
          "hover:text-brand-ink hover:shadow-[inset_0_0_0_1px_var(--color-brand-glow)]",
      },
    ],
    defaultVariants: {
      variant: "state",
      alt: false,
      interactive: false,
    },
  }
)

function Badge({
  className,
  variant = "state",
  alt = false,
  interactive = false,
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        // Focus ring only on the interactive render: the variants also dress passive markers.
        className: cn(
          badgeVariants({ variant, alt, interactive }),
          interactive &&
            "outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className
        ),
      },
      props
    ),
    render,
    state: { slot: "badge", variant, alt },
  })
}

export { Badge, badgeVariants }
