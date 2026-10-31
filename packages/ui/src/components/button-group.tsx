import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { moveToAdjacentRadio } from "@workspace/ui/lib/radio-row"
import { cn } from "@workspace/ui/lib/utils"

const buttonGroupVariants = cva("inline-flex w-fit items-stretch")

function ButtonGroup({
  className,
  onKeyDown,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="button-group"
      role="radiogroup"
      onKeyDown={(event) => {
        onKeyDown?.(event)
        moveToAdjacentRadio(event)
      }}
      className={cn(buttonGroupVariants(), className)}
      {...props}
    />
  )
}

// Amber has no hover step: the pointer must not mask the visitor's choice.
const buttonGroupItemVariants = cva(
  "flex cursor-pointer items-center font-mono font-medium whitespace-nowrap uppercase",
  {
    variants: {
      size: {
        badge: "px-[0.3125rem] py-[0.1875rem] text-8 tracking-[.06em]",
        segment: "text-8",
      },
      preset: { card: "", rail: "", search: "" },
      tone: { plain: "", recede: "", onDark: "" },
      active: { true: "", false: "" },
      unavailable: { true: "", false: "" },
      error: { true: "", false: "" },
    },
    compoundVariants: [
      { size: "badge", active: false, class: "bg-badge text-field-faint" },
      { size: "badge", active: true, class: "bg-wash text-brand-ink" },
      // A refused cell takes no hover: there is nothing a press would do.
      {
        size: "badge",
        active: false,
        unavailable: false,
        error: false,
        class:
          "hover:text-brand-ink hover:shadow-[inset_0_0_0_1px_var(--color-brand-glow)]",
      },
      {
        size: "badge",
        unavailable: true,
        class: "cursor-not-allowed text-unavailable",
      },
      {
        size: "badge",
        error: true,
        class: "cursor-not-allowed bg-error-wash text-error-ink",
      },

      {
        size: "segment",
        preset: "card",
        class: "px-[0.25rem] py-[0.1875rem] tracking-[.02em]",
      },
      {
        size: "segment",
        preset: "rail",
        class: "px-[0.375rem] py-[0.1875rem] tracking-[.06em]",
      },
      {
        size: "segment",
        preset: "search",
        class: "px-[0.4375rem] py-[0.25rem] tracking-[.06em]",
      },
      {
        size: "segment",
        tone: "plain",
        active: false,
        class: "bg-badge text-field-faint hover:text-title-ink",
      },
      {
        size: "segment",
        tone: "plain",
        active: true,
        class: "bg-wash text-brand-ink",
      },
      // No hover: an off card should not look less off under the pointer.
      {
        size: "segment",
        tone: "recede",
        active: false,
        class: "bg-transparent text-recede-ink",
      },
      {
        size: "segment",
        tone: "recede",
        active: true,
        class: "bg-recede-wash text-faint",
      },
      {
        size: "segment",
        tone: "onDark",
        active: false,
        class: "bg-band-chip text-band-dim hover:text-band-hover",
      },
      {
        size: "segment",
        tone: "onDark",
        active: true,
        class: "bg-band-wash text-band-brand",
      },
    ],
    defaultVariants: {
      size: "badge",
      preset: "card",
      tone: "plain",
      active: false,
      unavailable: false,
      error: false,
    },
  }
)

function ButtonGroupItem({
  className,
  size,
  preset,
  tone,
  active = false,
  error = false,
  type = "button",
  tabIndex,
  ...props
}: ComponentProps<"button"> &
  Omit<VariantProps<typeof buttonGroupItemVariants>, "unavailable">) {
  // The cva variant type admits `null`, which `aria-checked` does not.
  const checked = active ?? false
  // Read from `aria-disabled` so one attribute drives both semantics and paint.
  const unavailable = isRefused(props["aria-disabled"])
  const rovingTabIndex = checked ? 0 : -1

  return (
    <button
      type={type}
      data-slot="button-group-item"
      role="radio"
      aria-checked={checked}
      tabIndex={tabIndex ?? rovingTabIndex}
      className={cn(
        buttonGroupItemVariants({
          size,
          preset,
          tone,
          active: checked,
          unavailable,
          error,
        }),
        // Not in the cva: it is exported for passive renders.
        "outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
  )
}

function isRefused(ariaDisabled: ComponentProps<"button">["aria-disabled"]) {
  return ariaDisabled === true || ariaDisabled === "true"
}

export {
  ButtonGroup,
  ButtonGroupItem,
  buttonGroupItemVariants,
  buttonGroupVariants,
}
