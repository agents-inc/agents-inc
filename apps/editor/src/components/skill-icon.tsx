import { cn } from "@workspace/ui/lib/utils"

import { SKILL_ICON_PATHS } from "@/lib/skill-icons"

// The mark is drawn in `currentColor`, never its brand colour: colour is
// reserved for amber.
export function SkillIcon({
  monogram,
  slug,
  selected = false,
  className,
}: {
  monogram: string
  // `| undefined`: added skills have no slug.
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
