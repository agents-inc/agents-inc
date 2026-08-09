import { cn } from "@workspace/ui/lib/utils"

import { SKILL_ICON_PATHS } from "@/lib/skill-icons"

// The 26px logo slot. The design ships monograms everywhere and notes that
// real library logos belong in the same box once sourced — we have marks for
// roughly two thirds of the catalogue, so they render where they exist and the
// monogram fills in where they do not.
//
// The mark is drawn in `currentColor`, never its brand colour: design language
// rule 4 reserves colour for amber, and a wall of brand-coloured logos would
// drown the one signal the page uses to mean "you chose this". Selected cells
// tint the slot amber, which is the same rule working in the other direction.
//
// No fill: the slot sits directly on the cell. The design's `#f4f2ec` backing
// existed to give a bare monogram something to sit in; with real marks in the
// box it reads as a second surface competing with the cell itself.
export function SkillIcon({
  monogram,
  slug,
  selected = false,
  className,
}: {
  monogram: string
  // `| undefined` rather than a conditional spread at the call site: a grid
  // skill's slug is optional (added skills have none), and JSX has always read
  // an undefined prop as an absent one — which is why @types/react writes every
  // prop it owns the same way.
  slug?: string | undefined
  selected?: boolean
  className?: string
}) {
  const path = slug ? SKILL_ICON_PATHS[slug] : undefined

  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[1.625rem] shrink-0 place-items-center",
        selected ? "text-brand-ink" : "text-muted-foreground",
        className
      )}
    >
      {path ? (
        <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
          <path d={path} />
        </svg>
      ) : (
        <span className="font-mono text-10 font-semibold">{monogram}</span>
      )}
    </span>
  )
}
