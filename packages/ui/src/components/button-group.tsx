import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { moveToAdjacentRadio } from "@workspace/ui/lib/radio-row"
import { cn } from "@workspace/ui/lib/utils"

/**
 * BUTTED CELLS THAT SHOW EVERY OPTION AT REST — the design's answer to the
 * control that used to be one word you clicked to cycle.
 *
 * The rule the whole part exists for: THE INACTIVE CELL IS THE AFFORDANCE. It
 * is what you read to know what a click will do, so it stays legible — the
 * active cell is marked by going amber on the accent wash, never by the others
 * going pale. Lightening the inactive cell to signal inactivity was built and
 * rejected by name.
 *
 * A `radiogroup`, not a row of toggles, and that is a claim about the options
 * rather than a styling choice: they are mutually exclusive, one field holds
 * the answer, and only the role says so to a screen reader. It also buys the
 * row ONE tab stop instead of one per cell — see `radio-row.ts` for the arrow
 * keys that then do the moving.
 *
 * Two sizes, because the same idiom is drawn at two scales:
 *
 * · `badge` — the `plugin|eject` and `project|global` pairs inside a skill
 *   cell. No chrome at all: the cells butt, and the fill is the only edge. At
 *   this scale the skill's own name carries the meaning, so the cells may be
 *   quiet.
 * · `field` — the `all 42 | selected 14` filter on the skills hinge. A bordered
 *   box with a rule between the cells, sized to the accordion button opposite
 *   it. Here the two cells ARE the control, with no name above them to lean on,
 *   so the ink is a step darker than `badge`'s.
 */
const buttonGroupVariants = cva("inline-flex w-fit items-stretch", {
  variants: {
    size: {
      badge: "",
      // Border and height match `HingeButton`, which sits at the other end of
      // the same rule. `whitespace-nowrap` because the cells carry counts and a
      // wrap here would break the 24px box the rule is threaded through.
      field: "h-6 border border-rule bg-column whitespace-nowrap",
    },
  },
  defaultVariants: { size: "badge" },
})

function ButtonGroup({
  className,
  size,
  onKeyDown,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      data-slot="button-group"
      role="radiogroup"
      onKeyDown={(event) => {
        onKeyDown?.(event)
        moveToAdjacentRadio(event)
      }}
      className={cn(buttonGroupVariants({ size }), className)}
      {...props}
    />
  )
}

/**
 * One cell. The divider between cells is a `border-left` on every cell but the
 * first, which is what keeps a group of two and a group of five drawn by the
 * same rule — a wrapper-level divider would have to know how many there are.
 *
 * `badge` draws no divider at all: the cells butt, and the design's point is
 * that a pair reads as ONE control, which a rule down the middle undoes.
 */
const buttonGroupItemVariants = cva(
  "flex cursor-pointer items-center font-mono font-medium whitespace-nowrap uppercase",
  {
    variants: {
      size: {
        badge: "px-[0.3125rem] py-[0.1875rem] text-8 tracking-[.06em]",
        field:
          "px-[0.5625rem] text-9 tracking-[.07em] [&+&]:border-l [&+&]:border-rule",
      },
      active: { true: "bg-wash text-brand-ink", false: "" },
    },
    compoundVariants: [
      {
        size: "badge",
        active: false,
        class:
          "bg-badge text-muted-foreground hover:text-brand-ink hover:shadow-[inset_0_0_0_1px_var(--color-brand-glow)]",
      },
      {
        size: "field",
        active: false,
        class: "bg-badge text-matrix-ink hover:bg-muted hover:text-ink",
      },
      // Amber has no hover step: amber means the user chose this, so nothing
      // the pointer does may mask it. `field` is the exception the design draws
      // — a whole bordered cell needs SOME acknowledgement of the pointer, and
      // it deepens the wash rather than moving the ink.
      { size: "field", active: true, class: "hover:bg-brand-glow" },
    ],
    defaultVariants: { size: "badge", active: false },
  }
)

function ButtonGroupItem({
  className,
  size,
  active = false,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonGroupItemVariants>) {
  // `null` as well as `undefined`, because that is what the cva's own variant
  // type admits and `aria-checked` does not.
  const checked = active ?? false

  return (
    <button
      type={type}
      data-slot="button-group-item"
      role="radio"
      aria-checked={checked}
      // Roving tabindex: the checked cell is the group's tab stop, and the
      // arrow keys move from there.
      tabIndex={checked ? 0 : -1}
      className={cn(
        buttonGroupItemVariants({ size, active: checked }),
        // The package's one focus ring, on the element rather than in the cva,
        // because `buttonGroupItemVariants` is exported for the one caller that
        // needs the look without the control — a skill with no plugin form,
        // whose install mode is a statement rather than a choice.
        "outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
  )
}

export {
  ButtonGroup,
  ButtonGroupItem,
  buttonGroupItemVariants,
  buttonGroupVariants,
}
