import type { ComponentProps, ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

// The page has exactly two kinds of horizontal rule (design language rule 5),
// and both live here.
//
// Both bleed out of the main column's 60px padding with `-mx-gutter` so they
// touch the vertical dividers of the nav rail and roster, making the three
// columns read as one lattice rather than three stacked panels.

// A labelled section divider: a 60px rule stub, the label, then a full rule.
function Hinge({
  className,
  label,
  emphasis,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  label: string
  // The tail of the label, set in ink rather than muted.
  emphasis?: ReactNode
}) {
  return (
    <div
      data-slot="hinge"
      className={cn(
        "-mx-gutter my-gutter flex items-center gap-4 pl-gutter",
        className
      )}
      {...props}
    >
      <span className="-ml-gutter h-0 w-gutter shrink-0 border-t border-rule" />
      <span className="shrink-0 font-mono text-10 font-medium tracking-[.14em] whitespace-nowrap text-muted-foreground uppercase">
        {label}
        {emphasis ? <span className="text-ink"> {emphasis}</span> : null}
      </span>
      <span className="h-0 flex-1 border-t border-rule" />
    </div>
  )
}

// An unlabelled full-bleed rule — used only between domain sections.
function Rule({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="rule"
      role="separator"
      className={cn("-mx-gutter my-gutter h-0 border-t border-rule", className)}
      {...props}
    />
  )
}

export { Hinge, Rule }
