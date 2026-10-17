import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps, ReactNode } from "react"

import { Glyph } from "@workspace/ui/components/glyph"
import { cn } from "@workspace/ui/lib/utils"

const HINGE_INDEX = "shrink-0 font-mono text-12 font-medium text-brand"
const HINGE_WORDS =
  "shrink-0 font-mono text-13 font-medium tracking-[.13em] whitespace-nowrap text-title-ink uppercase"

const HINGE_RULE = "h-0 border-t border-rule"

// `column` spaces with MARGINS so two titles left adjacent by a folded step
// collapse to one gutter apart. `panel` spaces with PADDING so it cannot
// collapse with the sticky bands beneath it.
const hingeVariants = cva("flex items-center", {
  variants: {
    variant: {
      column: "-mx-gutter mt-gutter mb-[1.25rem] gap-4 px-gutter",
      panel: "gap-2.5 pr-0.5 pb-[1.875rem] pl-[1.0625rem]",
    },
  },
  defaultVariants: { variant: "column" },
})

// Negative margin offsets the padding so the hover fill does not move the words. The glyph is
// `invisible`, not unmounted, so it holds its box.
const HINGE_TOGGLE =
  "group/title -ml-2 inline-flex cursor-pointer items-center gap-4 px-2 py-1 outline-none select-none hover:bg-title-hover focus-visible:ring-1 focus-visible:ring-ring"
const HINGE_GLYPH =
  "invisible -ml-1.5 text-muted-foreground group-hover/title:visible group-hover/title:text-ink group-focus-visible/title:visible group-focus-visible/title:text-ink"

// The index is `aria-hidden` so the title's name is its words alone.
function HingeLabel({
  index,
  label,
  emphasis,
}: {
  index: string | undefined
  label: string
  emphasis: ReactNode
}) {
  return (
    <>
      {index ? (
        <span data-slot="hinge-index" aria-hidden className={HINGE_INDEX}>
          {index}
        </span>
      ) : null}
      {/* The space lives in the label's text node: a whitespace-only node is dropped from the
          accessible name. */}
      <span data-slot="hinge-words" className={HINGE_WORDS}>
        {emphasis ? (
          <>
            {`${label} `}
            <span data-slot="hinge-emphasis" className="text-ink-primary">
              {emphasis}
            </span>
          </>
        ) : (
          label
        )}
      </span>
    </>
  )
}

function HingeToggle({
  expanded,
  onToggle,
  children,
}: {
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className={HINGE_TOGGLE}
    >
      {children}
      <Glyph
        name={expanded ? "minus" : "plus"}
        size={10}
        className={HINGE_GLYPH}
      />
    </button>
  )
}

function Hinge({
  className,
  index,
  label,
  emphasis,
  variant = "column",
  expanded = true,
  onToggle,
  ...props
}: Omit<ComponentProps<"div">, "children"> &
  VariantProps<typeof hingeVariants> & {
    index?: string
    label: string
    emphasis?: ReactNode
    // Read only with `onToggle`.
    expanded?: boolean
    onToggle?: () => void
  }) {
  const words = <HingeLabel index={index} label={label} emphasis={emphasis} />

  return (
    <div
      data-slot="hinge"
      className={cn(hingeVariants({ variant }), className)}
      {...props}
    >
      {onToggle ? (
        <HingeToggle expanded={expanded} onToggle={onToggle}>
          {words}
        </HingeToggle>
      ) : (
        words
      )}
    </div>
  )
}

// Bleeds out of the main column's padding so it meets the rail and roster
// dividers.
function Rule({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="rule"
      role="separator"
      className={cn("-mx-gutter my-gutter", HINGE_RULE, className)}
      {...props}
    />
  )
}

export { Hinge, Rule, hingeVariants }
