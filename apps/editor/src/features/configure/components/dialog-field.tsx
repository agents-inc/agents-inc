import type { ReactNode } from "react"

// The field's own inset, put on the input so a press anywhere inside the
// border places the caret where it landed. Whole utilities: Tailwind cannot
// read an interpolated class.
export const FIELD_INSET = "px-3 py-2.5"

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="mt-3 block">
      <span className="block pb-1.5 font-mono text-9 font-medium tracking-[.04em] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="flex items-center border border-field-border">
        {children}
      </span>
    </label>
  )
}

// A dialog's one status line. `alert`, because it arrives after a deliberate
// press and is what explains why nothing changed.
export function Note({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="pt-3.5 font-mono text-10_5 text-brand-ink">
      {children}
    </p>
  )
}
