import { useNavigate } from "@tanstack/react-router"
import { DOMAIN_LABELS, type Domain } from "@workspace/matrix"
import { Button } from "@workspace/ui/components/button"
import { Chip } from "@workspace/ui/components/chip"
import { Input } from "@workspace/ui/components/input"
import { useEffect, useRef } from "react"

import {
  useBarStuckAttribute,
  usePinned,
} from "@/features/configure/lib/use-pinned"
import type { ConfigureSearch } from "@/routes/search"
import { useUiStore } from "@/stores/ui-store"

// The five the design chips; the catalogue's other domains still render as sections.
const CHIP_DOMAINS = ["web", "api", "ai", "infra", "shared"] as const

// Sticky, and it changes shape once pinned: the whole bar becomes a dark band
// and every control on it inverts. Clicking the active domain chip clears it,
// so the resting state renders every domain.
export function FilterBar({ search }: { search: ConfigureSearch }) {
  const navigate = useNavigate({ from: "/" })
  const setDialog = useUiStore((state) => state.setDialog)

  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // A filter change is a router navigation, which resets scroll by default.
  // `replace` for the query only, so typing does not fill the history stack.
  const update = (patch: Partial<ConfigureSearch>) =>
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
      resetScroll: false,
      replace: "q" in patch,
    })

  // Local, not a store field: the domain headers follow this from a root
  // attribute in CSS, and sharing it re-rendered all 240 cells on every flip.
  const stuck = usePinned(wrapRef)
  useBarStuckAttribute(stuck)

  // Reaching the top is the moment searching becomes the obvious thing to do,
  // so the caret is already there rather than one click away. Keyed on the
  // transition, not on every scroll event: this fires once per stick, or
  // typing anywhere else on the page would be impossible while pinned.
  useEffect(() => {
    if (stuck) searchRef.current?.focus({ preventScroll: true })
  }, [stuck])

  return (
    <>
      <div
        ref={wrapRef}
        // Horizontal padding only. Collapsing the design's 60px top padding
        // removes 78px of page height exactly as the bar pins, and scroll
        // anchoring then un-pins it — measured oscillating at scrollY 590/511.
        // The air above comes from the preceding hinge's margin instead.
        //
        // 84a: once stuck, only the colour bleeds. The gutters move from this
        // wrapper onto the field and the button, which is what lets #242320
        // reach the viewport edge while search still starts on the content
        // edge and add-skill still ends on it. The dark/white seam is then
        // what separates the bar from the domain header pinning beneath it.
        className={`sticky top-0 z-60 -mx-gutter pb-3 transition-[padding,background-color] duration-150 ${
          stuck ? "bg-ink px-0" : "bg-column px-gutter"
        }`}
      >
        {/* The gap is constant. The design collapses it to 0 when stuck so the
            two blocks butt together as one toolbar, but that snaps the add
            button sideways at the same instant the bar is already changing
            width and losing its border — three simultaneous shifts read as a
            jump. Holding the gap costs nothing and the transition stays calm. */}
        <div className="flex items-stretch gap-2.5">
          <div
            // Equal vertical padding in both states, for the same reason: any
            // height change here perturbs scroll at the moment of pinning. The
            // box itself goes on the band — border and fill both — leaving the
            // search text sitting straight on the dark.
            className={`flex min-w-0 flex-1 items-center gap-3 border py-[0.9375rem] transition-[padding] duration-150 ${
              stuck
                ? "border-transparent bg-transparent pr-0 pl-gutter"
                : "border-field-border bg-cell px-[0.9375rem]"
            }`}
          >
            <Input
              ref={searchRef}
              onDark={stuck}
              value={search.q}
              placeholder="search skills"
              aria-label="Search skills"
              onChange={(event) => update({ q: event.target.value })}
            />

            <div className="flex shrink-0 gap-[0.125rem]">
              {CHIP_DOMAINS.map((domain) => (
                <Chip
                  key={domain}
                  active={search.domain === domain}
                  onDark={stuck}
                  onClick={() =>
                    update({
                      domain:
                        search.domain === domain ? null : (domain as Domain),
                    })
                  }
                >
                  {DOMAIN_LABELS[domain]}
                </Chip>
              ))}
            </div>

            <div className="flex shrink-0 gap-[0.125rem]">
              <Chip
                active={search.rec}
                onDark={stuck}
                onClick={() => update({ rec: !search.rec })}
              >
                Recommended
              </Chip>
              <Chip
                active={search.sel}
                onDark={stuck}
                onClick={() => update({ sel: !search.sel })}
              >
                Selected
              </Chip>
            </div>
          </div>

          <Button
            variant="block"
            onDark={stuck}
            // Same 150ms as the wrapper, or the pieces arrive at different times.
            className={`transition-[padding] duration-150 ${
              stuck ? "pr-gutter pl-5" : ""
            }`}
            onClick={() => setDialog("add")}
          >
            ＋ Add skill
          </Button>
        </div>
      </div>
    </>
  )
}
