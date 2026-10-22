import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { activateOnEnterOrSpace } from "@workspace/ui/lib/button-role"
import { cn } from "@workspace/ui/lib/utils"

// Padding equals each card's line inset, so edge cards carry the same white as inner ones.
const latticeVariants = cva("grid p-lattice", {
  variants: {
    columns: {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-4",
    },
  },
  defaultVariants: { columns: 4 },
})

function Lattice({
  className,
  columns,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof latticeVariants>) {
  return (
    <div
      data-slot="lattice"
      className={cn(latticeVariants({ columns }), className)}
      {...props}
    />
  )
}

// The line is an inset `::after` outline, taking no room.
const latticeCellVariants = cva(
  "relative flex min-w-0 flex-col bg-cell after:pointer-events-none after:absolute after:inset-lattice after:outline-1 after:-outline-offset-1 after:outline-hairline after:content-['']",
  {
    variants: {
      interactive: {
        true: "cursor-pointer",
        false: "",
      },
      selected: {
        true: "after:outline-brand",
        false: "",
      },
      // Not `pointer-events-none`: the explaining tooltip must open. Callers guard their handlers.
      disabled: {
        true: "cursor-default bg-column",
        false: "",
      },
      overflow: {
        clip: "overflow-hidden",
        visible: "overflow-visible",
      },
    },
    compoundVariants: [
      {
        interactive: true,
        selected: false,
        class: "hover:bg-cell-hover",
      },
    ],
    defaultVariants: {
      interactive: true,
      selected: false,
      disabled: false,
      overflow: "clip",
    },
  }
)

// Only for a cell that is itself the control; inset because the cell clips.
const FOCUSABLE_CELL =
  "outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"

function LatticeCell({
  className,
  interactive,
  selected,
  disabled,
  overflow,
  tabIndex,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof latticeCellVariants>) {
  const isItselfTheControl = tabIndex !== undefined

  return (
    <div
      data-slot="lattice-cell"
      data-selected={selected || undefined}
      tabIndex={tabIndex}
      className={cn(
        latticeCellVariants({ interactive, selected, disabled, overflow }),
        isItselfTheControl && FOCUSABLE_CELL,
        className
      )}
      {...props}
    />
  )
}

// A sibling button stretched over a cell that holds controls: `role="button"` on the cell would
// make them presentational. Controls take `relative z-1`; content between is `pointer-events-none`.
function LatticeCellButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      data-slot="lattice-cell-button"
      type="button"
      className={cn(
        "absolute inset-0 z-0 cursor-[inherit] outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        className
      )}
      {...props}
    />
  )
}

function LatticeRows({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="lattice-rows" className={cn(className)} {...props} />
}

// `outline-none` only when unselected: Tailwind emits it after `.outline-1`, erasing the amber.
const latticeRowVariants = cva(
  "relative -mt-px flex cursor-pointer items-start gap-3 border border-hairline bg-cell px-3 py-2.5 focus-visible:ring-1 focus-visible:ring-ring",
  {
    variants: {
      selected: {
        true: "z-1 outline-1 -outline-offset-1 outline-brand",
        false: "outline-none hover:bg-row-hover",
      },
    },
    defaultVariants: { selected: false },
  }
)

// A `<div>` because a row holds flow content a `<button>` does not admit.
function LatticeRow({
  className,
  selected,
  onKeyDown,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof latticeRowVariants>) {
  return (
    <div
      data-slot="lattice-row"
      data-selected={selected || undefined}
      role="button"
      tabIndex={0}
      aria-pressed={selected ?? false}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        activateOnEnterOrSpace(event)
      }}
      className={cn(latticeRowVariants({ selected }), className)}
      {...props}
    />
  )
}

export {
  Lattice,
  LatticeCell,
  LatticeCellButton,
  LatticeRow,
  LatticeRows,
  latticeCellVariants,
  latticeRowVariants,
  latticeVariants,
}
