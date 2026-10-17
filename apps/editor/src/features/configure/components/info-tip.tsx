import { Glyph, type GlyphName } from "@workspace/ui/components/glyph"
import { cn } from "@workspace/ui/lib/utils"
import { useId, type ReactNode } from "react"

// The tip is a sibling so `peer-*` can reveal it; `:focus`, not
// `:focus-visible`, so the keyboard always opens it.
export function InfoTip({
  label,
  glyph,
  flip,
  className,
  children,
}: {
  label: string
  glyph: GlyphName
  flip: boolean
  className?: string
  children: ReactNode
}) {
  const tipId = useId()

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-describedby={tipId}
        className={cn("peer inline-flex", className)}
      >
        <Glyph name={glyph} size={12} />
      </button>
      <span
        id={tipId}
        className={cn(
          "absolute top-0 z-40 hidden w-[12.25rem] bg-tip-field px-[0.5625rem] py-[0.4375rem] font-mono text-8_5 leading-[1.65] font-normal tracking-normal text-matrix-ink normal-case peer-hover:block peer-focus:block",
          flip ? "right-[calc(100%+0.5rem)]" : "left-[calc(100%+0.5rem)]"
        )}
      >
        {children}
      </span>
    </>
  )
}
