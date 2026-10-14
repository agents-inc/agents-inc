import { Badge } from "@workspace/ui/components/badge"
import { Rule } from "@workspace/ui/components/divider"
import { Lattice } from "@workspace/ui/components/lattice"

import type { DomainView } from "@/features/configure/lib/derive"
import { DOMAIN_ANCHOR } from "@/features/configure/lib/use-active-domain"
import { useLatticeColumns } from "@/features/configure/lib/use-lattice-columns"
import { SkillCell } from "./skill-cell"

// No heading: the strip under the bar carries every domain's name. The anchor
// at the top edge is how the strip knows which domain the column is showing.
export function DomainSection({
  view,
  first,
}: {
  view: DomainView
  first: boolean
}) {
  // One value for the grid and for each cell's column, or the popover flips
  // against a grid that moved.
  const columns = useLatticeColumns()

  return (
    <section aria-label={`${view.label} skills`}>
      {first ? <div className="mt-[1.875rem]" /> : <Rule />}

      <div {...{ [DOMAIN_ANCHOR]: view.id }} className="h-0 overflow-hidden" />

      {view.categories.map((category) => (
        <div key={category.id} role="group" aria-label={category.displayName}>
          <div className="flex items-center gap-[0.5625rem] px-0.5 pt-9 pb-2">
            <span className="font-mono text-9 font-semibold tracking-[.12em] whitespace-nowrap text-ink uppercase">
              {category.displayName}
            </span>
            {category.exclusive && <Badge variant="outline">one of</Badge>}
          </div>

          <Lattice columns={columns}>
            {category.cells.map((cell, index) => (
              <SkillCell
                key={cell.skill.id}
                view={cell}
                column={index % columns}
                columns={columns}
              />
            ))}
          </Lattice>
        </div>
      ))}
    </section>
  )
}
