import { Badge } from "@workspace/ui/components/badge"
import { LatticeCell } from "@workspace/ui/components/lattice"
import { useEffect, useMemo, useRef } from "react"

import { SkillIcon } from "@/components/skill-icon"
import type { SkillCellView } from "@/features/configure/lib/derive"
import { track } from "@/lib/analytics/track"
import { freshEntry, useConfigStore } from "@/stores/config-store"
import { useUiStore } from "@/stores/ui-store"
import { SkillOptionsPanel } from "./skill-options-panel"

// The three squares of the ••• control, top to bottom. Named rather than
// indexed so the keys mean something.
const DOTS = ["top", "middle", "bottom"] as const

// "0 agents" reads as a failure on a skill that was just picked.
const agentSummary = (count: number) => {
  if (count === 0) return "no agents"
  return count === 1 ? "1 agent" : `${count} agents`
}

// The whole cell toggles selection, so every control inside stops propagation
// — otherwise flipping Install to Eject would also deselect the skill.
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

  const { skill, entry, selected, incompatible, agentCount } = view
  const open = openPanelSkillId === skill.id
  const cellRef = useRef<HTMLDivElement>(null)

  // What the badges and the panel show. A selected skill's own entry, else
  // whatever was configured before it was picked, else what picking it would
  // create — the same three fallbacks the store applies when it writes, so the
  // panel never shows one thing and saves another. Read here rather than in
  // `derive`, which deliberately cannot see `remembered`.
  const remembered = useConfigStore((state) => state.remembered[skill.id])
  const untouched = useMemo(() => freshEntry(skill.id), [skill.id])
  const options = entry ?? remembered ?? untouched

  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation()

  // Nothing inside an incompatible cell may select it — the whole cell, the
  // •••, and both badges all funnel into `toggleSkill`, so each entry point
  // has to check. The cell stays hoverable so its reason can be read.
  const select = () => {
    // The refusal is the interesting half. A click here means the 40% dim
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
      role="button"
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
      onKeyDown={(event) => {
        // Only when the cell itself holds focus. The ••• and the badges are
        // real buttons inside it, and their Enter would otherwise both
        // activate them and toggle the skill underneath.
        if (event.target !== event.currentTarget) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          select()
        }
      }}
    >
      <div className="flex items-start gap-2.5">
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
            {skill.added && <Badge variant="tag">added</Badge>}
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
          onClick={(event) => {
            stop(event)
            requestPanel()
          }}
          className={`group/dots ml-auto flex shrink-0 cursor-pointer flex-col gap-[2px] p-1 transition-opacity duration-[120ms] outline-none hover:bg-badge focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring ${
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

      <div className="mt-[0.5625rem] -ml-[0.3125rem] flex items-center gap-[0.125rem]">
        <Badge
          interactive
          alt={options.install === "eject"}
          render={
            <button
              type="button"
              // "plugin, button" tells a screen reader nothing on its own.
              aria-label={`Install mode: ${options.install}`}
              onClick={(event) => {
                stop(event)
                flip({
                  install: options.install === "eject" ? "plugin" : "eject",
                })
              }}
            />
          }
        >
          {options.install}
        </Badge>

        <Badge
          interactive
          alt={options.scope === "global"}
          render={
            <button
              type="button"
              aria-label={`Scope: ${options.scope}`}
              onClick={(event) => {
                stop(event)
                flip({
                  scope: options.scope === "global" ? "project" : "global",
                })
              }}
            />
          }
        >
          {options.scope}
        </Badge>

        {/* Derived from assignments, never stored on the skill. A label, not a
            control: the ••• is the only way into the options panel. */}
        {selected && (
          <span className="ml-auto shrink-0 py-[0.1875rem] font-mono text-8 font-medium tracking-[.06em] whitespace-nowrap text-muted-foreground uppercase">
            {agentSummary(agentCount)}
          </span>
        )}
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
