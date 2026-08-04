import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

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

const latticeRowVariants = cva(
  "relative -mt-px flex cursor-pointer items-start gap-3 border border-hairline bg-cell px-3 py-2.5",
  {
    variants: {
      selected: {
        true: "z-1 outline-1 -outline-offset-1 outline-brand",
        false: "hover:bg-row-hover",
      },
    },
    defaultVariants: { selected: false },
  }
)

function LatticeRow({
  className,
  selected,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof latticeRowVariants>) {
  return (
    <div
      data-slot="lattice-row"
      data-selected={selected || undefined}
      className={cn(latticeRowVariants({ selected }), className)}
      {...props}
    />
  )
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
