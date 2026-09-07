import { Badge } from "@workspace/ui/components/badge"
import {
  ButtonGroup,
  ButtonGroupItem,
  buttonGroupItemVariants,
} from "@workspace/ui/components/button-group"
import {
  LatticeCell,
  LatticeCellButton,
} from "@workspace/ui/components/lattice"
import { cn } from "@workspace/ui/lib/utils"
import { useEffect, useMemo, useRef } from "react"

import { SkillIcon } from "@/components/skill-icon"
import type { SkillCellView } from "@/features/configure/lib/derive"
import { track } from "@/lib/analytics/track"
import { freshEntry, isEjectOnly, useConfigStore } from "@/stores/config-store"
import { SKILL_INSTALL_MODES, SKILL_SCOPES } from "@/stores/persisted-schema"
import { useUiStore } from "@/stores/ui-store"
import { SkillOptionsPanel } from "./skill-options-panel"

// The three squares of the ••• control, top to bottom. Named rather than
// indexed so the keys mean something.
const DOTS = ["top", "middle", "bottom"] as const

// The whole cell toggles selection — through a `LatticeCellButton` stretched
// over it, not through the cell itself, because the cell also holds the •••
// and two badges and a control cannot contain controls.
//
// The toggle is a SIBLING of those controls rather than their ancestor, which
// is why none of them stops propagation any more: a press on a badge lands on
// the badge and bubbles past nothing that would also flip the selection. It
// had to, while the cell itself was the control (EDITOR-45).
export function SkillCell({
  view,
  column,
  columns,
}: {
  view: SkillCellView
  column: number
  columns: number
}) {
  const toggleSkill = useConfigStore((state) => state.toggleSkill)
  const setSkillOption = useConfigStore((state) => state.setSkillOption)
  const openPanelSkillId = useUiStore((state) => state.openPanelSkillId)
  const togglePanel = useUiStore((state) => state.togglePanel)
  const openPanel = useUiStore((state) => state.openPanel)
  const previewSkill = useUiStore((state) => state.previewSkill)

  const { skill, entry, selected, incompatible } = view
  const open = openPanelSkillId === skill.id
  // A skill from outside the catalogue has no plugin form, so its badge is a
  // statement rather than a toggle — see `isEjectOnly`.
  const ejectOnly = isEjectOnly(skill.id)
  const cellRef = useRef<HTMLDivElement>(null)

  // What the badges and the panel show. A selected skill's own entry, else
  // whatever was configured before it was picked, else what picking it would
  // create — the same three fallbacks the store applies when it writes, so the
  // panel never shows one thing and saves another. Read here rather than in
  // `derive`, which deliberately cannot see `remembered`.
  const remembered = useConfigStore((state) => state.remembered[skill.id])
  const untouched = useMemo(() => freshEntry(skill.id), [skill.id])
  const options = entry ?? remembered ?? untouched

  // Nothing inside an incompatible cell may select it — the whole cell, the
  // •••, and both badges all funnel into `toggleSkill`, so each entry point
  // has to check. The cell stays hoverable so its reason can be read.
  const select = () => {
    // The refusal is the interesting half. A click here means the receded cell
    // read as "broken" rather than "unavailable", and it is the only direct
    // evidence there is for the catalog's unaudited relationships. It cannot
    // be emitted from the store, because the whole point is that the store is
    // never reached.
    if (incompatible) {
      track({
        name: "skill_blocked",
        skillId: skill.id,
        reason: view.incompatibleReason ?? "unknown",
      })
      return
    }

    toggleSkill(skill.id)
  }

  // The ••• and the badges configure a skill; they never select one. On an
  // unselected skill the store keeps what they set in `remembered`, so the
  // controls stay live and picking the skill later restores exactly this.
  const requestPanel = () => {
    if (!incompatible) togglePanel(skill.id)
  }

  const flip = (patch: Parameters<typeof setSkillOption>[1]) => {
    if (!incompatible) setSkillOption(skill.id, patch)
  }

  // `pointerdown`, not `click`, so the panel is gone before the press
  // resolves. Presses inside are ignored, or the ••• would close then reopen.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!cellRef.current?.contains(event.target as Node)) openPanel(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") openPanel(null)
    }

    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, openPanel])

  return (
    <LatticeCell
      ref={cellRef}
      selected={selected}
      disabled={incompatible}
      interactive={!incompatible}
      overflow={selected || open ? "visible" : "clip"}
      className={`group/cell px-3 py-[0.6875rem] ${open ? "z-58" : ""}`}
    >
      <LatticeCellButton
        tabIndex={incompatible ? -1 : 0}
        // Otherwise the accessible name is every string in the cell, run
        // together. It stays the plain name even when the skill is ruled out —
        // `title` becomes the accessible *description*, which is where a reason
        // belongs, and a name that changes under you is its own problem.
        aria-label={skill.displayName}
        aria-pressed={selected}
        aria-disabled={incompatible || undefined}
        title={view.incompatibleReason}
        onClick={select}
      />

      <div className="pointer-events-none relative z-1 flex items-start gap-2.5">
        <SkillIcon
          monogram={skill.monogram}
          slug={skill.slug}
          selected={selected}
        />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-12 leading-[1.25] font-semibold text-ink">
              {skill.displayName}
            </span>
            {/* The provenance tag is also the way into what this skill holds
                — one click, on the very thing that says it came from somewhere
                else. Only added skills have contents to show: the catalogue's
                own are generated from the marketplace repository this app is
                built from, and the ••• already links their source.

                No `incompatible` guard, unlike the ••• and the badges below:
                reading is not configuring, and a cell stays hoverable so its
                reason can be read — what it holds is part of that reason. */}
            {skill.added && (
              <Badge
                variant="tag"
                interactive
                className="pointer-events-auto"
                render={
                  <button
                    type="button"
                    aria-label={`Contents of ${skill.displayName}`}
                    onClick={() => previewSkill(skill.id)}
                  />
                }
              >
                added
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5 font-mono text-9 font-medium text-muted-foreground">
            <span className="truncate">{skill.description}</span>
          </div>
        </div>

        {/* Three 2px squares, not a `•••` glyph — the design draws them as
            boxes, and a font would never land on the same rhythm. They stay in
            the layout at zero opacity so revealing one cannot reflow the row,
            and focus reveals them too, or the keyboard could never find them.
            Revealed and marked are two different things, so focus does both:
            the ring is the design system's one focus treatment. */}
        <button
          type="button"
          aria-label={`Options for ${skill.displayName}`}
          aria-expanded={open}
          onClick={requestPanel}
          className={`group/dots pointer-events-auto ml-auto flex shrink-0 cursor-pointer flex-col gap-[2px] p-1 transition-opacity duration-[120ms] outline-none hover:bg-badge focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring ${
            open ? "opacity-100" : "opacity-0 group-hover/cell:opacity-100"
          }`}
        >
          {DOTS.map((dot) => (
            <span
              key={dot}
              aria-hidden
              className={`block size-[2px] ${
                open ? "bg-brand-ink" : "bg-faint group-hover/dots:bg-brand-ink"
              }`}
            />
          ))}
        </button>
      </div>

      {/* TWO BUTTED PAIRS, EVERY VALUE ON SCREEN. Each was one word that
          flipped on click until the 2026-09-06 refresh, so what a press would
          do was invisible until you had done it.

          THE GAPS ARE THE WHOLE LAYOUT AND THEY ARE NOT INTERCHANGEABLE: 0px
          inside a pair, which is what makes a pair read as one control, and
          10px between them, which is what separates mode from scope. The other
          way round draws four unrelated chips. `min-w-0` on the row and
          `flex-none` on the groups, or four cells in a 222px box shrink and
          wrap.

          `pointer-events-auto` per group rather than per cell: the row is
          inert so the selection overlay underneath it keeps the cell's own
          clicks, and each group takes back exactly its own box. */}
      <div className="pointer-events-none relative z-1 mt-[0.5625rem] -ml-[0.3125rem] flex min-w-0 items-center gap-[0.625rem]">
        {ejectOnly ? (
          // A STATEMENT RATHER THAN A CHOICE, and so not a group at all: an
          // added skill has no plugin form, and a `PLUGIN` cell that refuses
          // the press is a dead affordance the refresh's own rule forbids —
          // the inactive cell is what you read to know what a click does, so
          // one that does nothing is worse than absent.
          //
          // It still has to CATCH the press. While the cell was the control, a
          // press falling through here TOGGLED SELECTION, which made one target
          // on screen mean two different things depending on the kind of skill
          // under it (EDITOR-45). It catches it by being the topmost thing at
          // that point rather than by stopping anything.
          <span
            aria-label={`Install mode: ${options.install}`}
            className={cn(
              buttonGroupItemVariants({ active: true }),
              "pointer-events-auto flex-none cursor-default"
            )}
          >
            {options.install}
          </span>
        ) : (
          <ButtonGroup
            aria-label="Install mode"
            className="pointer-events-auto flex-none"
          >
            {SKILL_INSTALL_MODES.map((mode) => (
              <ButtonGroupItem
                key={mode}
                active={options.install === mode}
                onClick={() => flip({ install: mode })}
              >
                {mode}
              </ButtonGroupItem>
            ))}
          </ButtonGroup>
        )}

        <ButtonGroup
          aria-label="Scope"
          className="pointer-events-auto flex-none"
        >
          {SKILL_SCOPES.map((scope) => (
            <ButtonGroupItem
              key={scope}
              active={options.scope === scope}
              onClick={() => flip({ scope })}
            >
              {scope}
            </ButtonGroupItem>
          ))}
        </ButtonGroup>
      </div>

      {open && (
        <SkillOptionsPanel
          skillId={skill.id}
          sourceUrl={skill.sourceUrl}
          entry={options}
          flip={column === columns - 1}
        />
      )}
    </LatticeCell>
  )
}
