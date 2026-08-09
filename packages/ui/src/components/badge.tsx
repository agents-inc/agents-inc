import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

// The three small mono markers in the design language. All are square, all are
// uppercase mono, and only `state` is interactive.
//
// `state`   — the install-mode / scope badges on a skill cell. Always present,
// always showing the current value; clicking flips it. The `alt`
// modifier is the whole point of the design's accent rule: a badge
// goes amber precisely when it holds a non-default value.
// `tag`     — a static amber marker (`added`, exclusivity hints in dialogs).
// `outline` — the `one of` / `multi` exclusivity tag beside a category label.
//
// Render as a `<button>` via `render` when interactive, so keyboard users get
// the flip too; the cell click handler must be stopped from also firing.
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
      // A non-default value. Only meaningful on `state`.
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
        // The package's one focus ring, on the interactive render only: the
        // same variants dress the `added` tag and the exclusivity marker, and
        // a thing that cannot take focus should not carry a rule about being
        // focused.
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
