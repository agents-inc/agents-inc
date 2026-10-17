import { cva } from "class-variance-authority"
import { Fragment, type ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

type LoadState = "lazy" | "preloaded" | null

const matrixCellVariants = cva(
  "flex h-5 cursor-pointer items-center justify-center border font-mono text-7 font-semibold tracking-[.03em] uppercase",
  {
    variants: {
      state: {
        empty: "border-divider text-rule",
        lazy: "border-matrix-border bg-matrix text-matrix-ink",
        preloaded: "border-brand-border bg-wash text-brand-ink",
      },
    },
    defaultVariants: { state: "empty" },
  }
)

type MatrixCell = {
  key: string
  state: LoadState
  label: string
  onCycle: () => void
}

type MatrixRow = {
  key: string
  label: string
  // `null`: no sub-agent for that domain and role; drawn like an empty cell but inert.
  cells: (MatrixCell | null)[]
}

// Clicking cycles empty → lazy → preloaded; the cell's word is the state.
function MatrixGrid({
  className,
  columns,
  rows,
  ...props
}: Omit<ComponentProps<"div">, "rows"> & {
  columns: string[]
  rows: MatrixRow[]
}) {
  return (
    <div
      data-slot="matrix-grid"
      className={cn("grid gap-[0.125rem]", className)}
      style={{ gridTemplateColumns: `auto repeat(${columns.length}, 1fr)` }}
      {...props}
    >
      <span />
      {columns.map((column) => (
        <span
          key={column}
          className="pt-[0.125rem] pb-[0.25rem] text-center font-mono text-7_5 font-semibold tracking-[.08em] text-muted-foreground uppercase"
        >
          {column}
        </span>
      ))}

      {rows.map((row) => (
        <Fragment key={row.key}>
          <span className="flex items-center pr-[0.5rem] pl-[0.125rem] font-mono text-8 font-semibold tracking-[.06em] text-ink-3 uppercase">
            {row.label}
          </span>
          {row.cells.map((cell, column) =>
            cell ? (
              <button
                key={cell.key}
                type="button"
                aria-label={`${row.label} ${cell.label}`}
                // Focus ring here, not in the cva: the inert gap shares the variants.
                className={cn(
                  matrixCellVariants({ state: cell.state ?? "empty" }),
                  "outline-none focus-visible:ring-1 focus-visible:ring-ring"
                )}
                onClick={cell.onCycle}
              >
                {cell.state === "preloaded" ? "pre" : (cell.state ?? "")}
              </button>
            ) : (
              <span
                key={`${row.key}-gap-${columns[column]}`}
                aria-hidden
                className={cn(
                  matrixCellVariants({ state: "empty" }),
                  "cursor-default"
                )}
              />
            )
          )}
        </Fragment>
      ))}
    </div>
  )
}

export { MatrixGrid, matrixCellVariants }
export type { LoadState, MatrixCell, MatrixRow }
