import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps, KeyboardEvent } from "react"

import { cn } from "@workspace/ui/lib/utils"

const ACTIVATION_KEYS = ["Enter", " "]

// The collapsed hairline grid: every line and surface belongs to a cell, and
// the container is a layout device rather than a box. Cells draw a full border
// and are pulled back 1px so each shared edge lands on one physical line.
//
// The design file puts the border on the *grid* instead, which is equivalent
// only while every row is full — and ours are often partial, where that paints
// white across the empty columns and runs a rule past the last cell.
const latticeVariants = cva("grid", {
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

const latticeCellVariants = cva(
  "relative -mt-px -ml-px flex min-w-0 flex-col border border-hairline bg-cell",
  {
    variants: {
      interactive: {
        true: "cursor-pointer hover:bg-cell-hover",
        false: "",
      },
      selected: {
        true: "z-1 outline-1 -outline-offset-1 outline-brand",
        false: "",
      },
      // Incompatible skills are shown but disabled — never hidden. Dimming is
      // the whole signal, as in the design.
      //
      // Deliberately not `pointer-events-none`: the cell has to stay hoverable
      // or the tooltip explaining *why* it is out never opens. Callers pass
      // `interactive={false}` and guard their own handlers instead.
      disabled: {
        true: "cursor-default opacity-40",
        false: "",
      },
      // Clipped so a long name cannot bleed across a hairline, except when
      // hosting the popover, which is positioned just outside the cell.
      overflow: {
        clip: "overflow-hidden",
        visible: "overflow-visible",
      },
    },
    defaultVariants: {
      interactive: true,
      selected: false,
      disabled: false,
      overflow: "clip",
    },
  }
)

function LatticeCell({
  className,
  interactive,
  selected,
  disabled,
  overflow,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof latticeCellVariants>) {
  return (
    <div
      data-slot="lattice-cell"
      data-selected={selected || undefined}
      className={cn(
        latticeCellVariants({ interactive, selected, disabled, overflow }),
        className
      )}
      {...props}
    />
  )
}

// A lattice whose cells are full-width rows rather than grid columns.
function LatticeRows({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="lattice-rows" className={cn(className)} {...props} />
}

// The package's one focus ring, in the cva base: every render of this cva is a
// row, and every row is focusable.
//
// `outline-none` is the exception, and it sits in the UNSELECTED branch rather
// than beside the ring. Selection is drawn with `outline` and focus with
// `ring`, and Tailwind emits `.outline-none` AFTER `.outline-1` at equal
// specificity — so `outline-none` in the base would win over the selected
// branch and silently erase the amber every staged row is recognised by. A
// selected row needs no `outline-none` anyway: it already states width, style
// and colour, so nothing is left for the user agent to decide.
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

// A row whose whole surface is the click target — the add-skill dialog's result
// rows, which are the only way to stage a skill.
//
// A `<div>` with the button semantics on it rather than a `<button>`: a row
// holds a heading, a description and a provenance line, which is flow content,
// and a `<button>` admits only phrasing content. `CommandBlock` reached the
// same answer for the same reason, and this follows it down to the shared
// handler.
//
// It follows that a row is a LEAF. Nothing focusable may be nested inside one —
// the add-skill dialog's stage marker is a `<span>` dressed in `chipVariants`
// precisely because of this, and axe's `nested-interactive` is what says so if
// a later caller forgets.
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
      // Selection stated to assistive technology as well as in the classes, the
      // way `Chip` does it — a staged row that only goes amber says nothing.
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

// A real click rather than a call to `onClick`: it is what a native button does
// with these two keys, and it keeps the pointer and the keyboard on one
// handler — including the caller that deliberately passes none, whose row then
// refuses both devices alike.
function activateOnEnterOrSpace(event: KeyboardEvent<HTMLDivElement>) {
  if (!ACTIVATION_KEYS.includes(event.key)) return

  // Space would scroll the dialog otherwise.
  event.preventDefault()
  event.currentTarget.click()
}

export {
  Lattice,
  LatticeCell,
  LatticeRow,
  LatticeRows,
  latticeCellVariants,
  latticeRowVariants,
  latticeVariants,
}
