import type { ReactNode } from "react"

// On the input, so a press anywhere inside the border places the caret.
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

// `alert`: it explains why a deliberate press changed nothing.
export function Note({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="pt-3.5 font-mono text-10_5 text-brand-ink">
      {children}
    </p>
  )
}
