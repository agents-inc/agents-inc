import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps, ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

// The page has exactly two kinds of horizontal rule (design language rule 5),
// and both live here.
//
// Both bleed out of the main column's 60px padding with `-mx-gutter` so they
// touch the vertical dividers of the nav rail and roster, making the three
// columns read as one lattice rather than three stacked panels.

// What makes every hinge ONE treatment, declared once so the two arms cannot
// drift apart: the label's type, and the hairline a rule is drawn in. `rule`
// is the section-divider token and is used at no other scale — `hairline`
// (#dcd7c9), which the cell lattice is drawn in, is deliberately not it.
const HINGE_LABEL =
  "shrink-0 font-mono text-10 font-medium tracking-[.14em] whitespace-nowrap text-muted-foreground uppercase"
const HINGE_RULE = "h-0 border-t border-rule"

// `column` is the main column's full-bleed hinge; `panel` is the roster's.
//
// Five differences and no others, each with a reason:
//   (a) no leading stub — the panel has no gutter to bleed into, and a 60px
//       stub plus the flex gap would put the header's first ink 76px in while
//       every row beneath it is locked to the panel's 17px flush edge. That
//       edge is the panel's only alignment rule.
//   (b) gap 6px, not 16px — the panel is 300px wide and cannot afford 16px
//       twice.
//   (c) the rule is floored (see `hingeRuleVariants`).
//   (d) the 60px clearance is PADDING, not margin: it must not collapse with
//       the sticky bands beneath it. There is no top spacing at all, because
//       the panel's own `pt-gutter` already supplies it.
//   (e) no negative margins — the panel has nothing to bleed into.
//
// `relative` on the column arm is the containing block for `action`, and is
// there for nothing else.
const hingeVariants = cva("flex items-center", {
  variants: {
    variant: {
      column: "relative -mx-gutter my-gutter gap-4 pl-gutter",
      panel: "gap-1.5 pr-0.5 pb-gutter pl-[1.0625rem]",
    },
  },
  defaultVariants: { variant: "column" },
})

// (c): both the label and the panel's control are `shrink-0 whitespace-nowrap`,
// so the rule is the only shrinkable item in the row — without a floor it
// collapses to zero in a narrow panel and the treatment disappears.
const hingeRuleVariants = cva(HINGE_RULE, {
  variants: {
    variant: {
      column: "flex-1",
      panel: "min-w-[0.625rem] flex-1 basis-0",
    },
  },
  defaultVariants: { variant: "column" },
})

// A labelled section divider: a 60px rule stub, the label, then a full rule.
//
// The two arms take DIFFERENTLY NAMED slots rather than sharing one, because a
// prop that means two things is a trap — and each name belongs to exactly one
// arm, which is stated here because it is not enforced by the type. A
// discriminated union WOULD enforce it, and was tried: Storybook intersects
// the arms and collapses `Meta<typeof Hinge>`'s args to `never`, taking every
// story in this file's neighbour down with it.
//
//   `action`  (column) is out of flow, painted over the trailing rule on the
//             column's content edge;
//   `control` (panel)  is an ordinary flow child between the label and the
//             rule.
function Hinge({
  className,
  label,
  emphasis,
  variant = "column",
  action,
  control,
  ...props
}: Omit<ComponentProps<"div">, "children"> &
  VariantProps<typeof hingeVariants> & {
    label: string
    // The tail of the label, set in ink rather than muted.
    emphasis?: ReactNode
    action?: ReactNode
    control?: ReactNode
  }) {
  return (
    <div
      data-slot="hinge"
      className={cn(hingeVariants({ variant }), className)}
      {...props}
    >
      {variant === "column" ? (
        <span className={cn("-ml-gutter w-gutter shrink-0", HINGE_RULE)} />
      ) : null}
      <span className={HINGE_LABEL}>
        {label}
        {emphasis ? <span className="text-ink"> {emphasis}</span> : null}
      </span>
      {control}
      <span className={hingeRuleVariants({ variant })} />
      {action ? (
        // `right-gutter` puts the button's RIGHT edge on the main column's
        // content edge — the x the skill grid, the filter bar and the add-skill
        // block all end on — and it derives from the gutter, so it follows it
        // at every width. `top-1/2 -translate-y-1/2` is the only way to centre
        // against a zero-height rule.
        <span className="absolute top-1/2 right-gutter -translate-y-1/2">
          {action}
        </span>
      ) : null}
    </div>
  )
}

// The 24px square that sits in a hinge's `action` slot. Geometry and colour
// live here rather than at the call site, because they are design furniture:
// the border is the SAME token as the rule it interrupts, so the square reads
// as a knot in the line rather than a button dropped on it, and the fill is
// the main column's own background — not white and not transparent, which is
// the whole trick. Transparent and a line runs through the glyph; white and it
// prints a patch on the #fdfdfc column.
//
// The glyph and the accessible name are app copy and app state, so they stay
// with the caller.
//
// Two of the three hover steps are `buttonVariants`' `outline` arm verbatim.
// All three move together and there is no transition: nothing in the main
// column animates except the filter bar's padding.
//
// Known gap: 24px is already below the 44px minimum touch target. The design
// draws it at 24 and this does not silently enlarge it.
function HingeButton({
  className,
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      data-slot="hinge-button"
      type={type}
      className={cn(
        "flex size-6 cursor-pointer items-center justify-center border border-rule bg-column font-mono text-12 font-normal text-muted-foreground outline-none select-none hover:border-dialog-border hover:bg-muted hover:text-ink focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
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

export { Hinge, HingeButton, Rule, hingeRuleVariants, hingeVariants }
