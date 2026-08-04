import { Badge } from "@workspace/ui/components/badge"
import { Rule } from "@workspace/ui/components/divider"
import { Lattice } from "@workspace/ui/components/lattice"
import { useRef } from "react"

import type { DomainView } from "@/features/configure/lib/derive"
import { usePinnedAttribute } from "@/features/configure/lib/use-pinned"
import { SkillCell } from "./skill-cell"

const COLUMNS = 4

// Every skill in the category is rendered — no accordion, no collapse. The
// header pins under the filter bar and follows it from 87px to 51px.
export function DomainSection({
  view,
  first,
}: {
  view: DomainView
  first: boolean
}) {
  const headerRef = useRef<HTMLDivElement>(null)
  // Straight to the DOM: through React state this re-rendered every cell for
  // a value only a border reads — an 88ms task with the full catalogue up.
  usePinnedAttribute(headerRef)

  return (
    // Named so the domain is a landmark rather than an anonymous <section>.
    <section aria-label={`${view.label} skills`}>
      {first ? <div className="mt-[1.875rem]" /> : <Rule />}

      <div
        ref={headerRef}
        // `data-pinned`: while holding the top it floats over content and
        // needs an edge; in flow it has none, per the whitespace rule.
        // `data-bar-stuck`: follows the bar up, the design's own rule.
        className="sticky top-[5.4375rem] z-56 -mx-gutter flex items-baseline gap-[0.6875rem] border-b border-transparent bg-column px-gutter pt-3.5 pb-[0.8125rem] data-pinned:border-hairline [html[data-bar-stuck]_&]:top-[3.1875rem]"
      >
        <h2 className="text-25 font-semibold tracking-[-.01em] text-ink">
          {view.label}
        </h2>
        <span className="font-mono text-11 font-medium text-brand-ink">
          skills
        </span>
      </div>

      {view.categories.map((category) => (
        // Named, so the exclusivity tag describes something the tree delimits.
        <div key={category.id} role="group" aria-label={category.displayName}>
          <div className="flex items-center gap-[0.5625rem] px-0.5 pt-9 pb-2">
            <span className="font-mono text-9_5 font-semibold tracking-[.12em] whitespace-nowrap text-ink uppercase">
              {category.displayName}
            </span>
            <Badge variant="outline">
              {category.exclusive ? "one of" : "multi"}
            </Badge>
          </div>

          <Lattice columns={COLUMNS}>
            {category.cells.map((cell, index) => (
              <SkillCell
                key={cell.skill.id}
                view={cell}
                column={index % COLUMNS}
                columns={COLUMNS}
              />
            ))}
          </Lattice>
        </div>
      ))}
    </section>
  )
}
