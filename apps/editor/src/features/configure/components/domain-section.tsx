import { Badge } from "@workspace/ui/components/badge"
import { Rule } from "@workspace/ui/components/divider"
import { Lattice } from "@workspace/ui/components/lattice"

import type { DomainView } from "@/features/configure/lib/derive"
import { DOMAIN_ANCHOR } from "@/features/configure/lib/use-active-domain"
import { useLatticeColumns } from "@/features/configure/lib/use-lattice-columns"
import { SkillCell } from "./skill-cell"

// Every skill in the category is rendered — no accordion, no collapse.
//
// THE DOMAIN'S TITLE IS NOT HERE. It used to be a 25px heading pinning under
// the filter bar as you reached it; every title is now on screen at once in the
// strip under that bar. A heading left behind would repeat, under the strip, the name the
// strip is already carrying.
//
// What replaces it is a zero-height anchor at the section's top edge, which is
// how the strip knows which domain the column is showing. The section keeps its
// `aria-label`, so it is still a named region — the title moved, it did not go.
export function DomainSection({
  view,
  first,
}: {
  view: DomainView
  first: boolean
}) {
  // Read here rather than threaded down from the screen, and used twice: the
  // grid is drawn with it, and each cell is told which of its columns it landed
  // in. One value for both, or the popover flips against a grid that moved.
  const columns = useLatticeColumns()

  return (
    // Named so the domain is a landmark rather than an anonymous <section>.
    <section aria-label={`${view.label} skills`}>
      {first ? <div className="mt-[1.875rem]" /> : <Rule />}

      {/* Zero-height: it marks a position without occupying one, so the
          spacing above is the rule's and nothing here contributes to it. */}
      <div {...{ [DOMAIN_ANCHOR]: view.id }} className="h-0 overflow-hidden" />

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
