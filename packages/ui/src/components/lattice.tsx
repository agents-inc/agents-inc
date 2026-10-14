import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps, KeyboardEvent } from "react"

import { cn } from "@workspace/ui/lib/utils"

const ACTIVATION_KEYS = ["Enter", " "]

// The grid draws nothing. Its padding equals each card's line inset, so the
// edge cards carry the same white as the inner ones.
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

// The card's line is an inset `::after` outline, so it takes no room. Selected
// changes only the line's colour and takes no hover tint.
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
      // Incompatible cells recede to the column colour rather than fade. Not
      // `pointer-events-none`: the tooltip explaining why has to open. Callers
      // pass `interactive={false}` and guard their own handlers.
      disabled: {
        true: "cursor-default bg-column",
        false: "",
      },
      // Clipped so a long name cannot bleed past the card's line, except when
      // hosting the popover, which is positioned just outside the cell.
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

// Only for a cell that is itself the control. Inset because the cell clips
// what overflows it.
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

// The primary action of a cell that holds controls of its own. `role="button"`
// on the cell would make those controls presentational (axe's
// `nested-interactive`), so the surface is a sibling <button> stretched over
// the cell at `z-0`. The cell's controls take `relative z-1`, and the content
// between is `pointer-events-none` so it does not swallow the click.
//
// `cursor-[inherit]` keeps the cell's `interactive`/`disabled` cursor. The ring
// is inset because the cell's `overflow-hidden` would clip an outset one.
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

// `outline-none` sits in the unselected branch, not the base: Tailwind emits
// `.outline-none` after `.outline-1` at equal specificity, so in the base it
// would erase the selected row's amber outline.
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

// A `<div>` with button semantics because a row holds flow content, which a
// `<button>` does not admit. Nothing focusable may be nested inside one.
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

// A real click rather than a call to `onClick`, so the pointer and the keyboard
// share one handler.
function activateOnEnterOrSpace(event: KeyboardEvent<HTMLDivElement>) {
  if (!ACTIVATION_KEYS.includes(event.key)) return

  // Space would scroll the dialog otherwise.
  event.preventDefault()
  event.currentTarget.click()
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
