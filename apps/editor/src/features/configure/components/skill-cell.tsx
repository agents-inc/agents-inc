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
import {
  UNOFFERED_PLACEMENT_ERROR,
  offersPlacement,
  patchForPress,
  pressRefusal,
} from "@/features/configure/lib/provider"
import { track } from "@/lib/analytics/track"
import { freshEntry, isEjectOnly, useConfigStore } from "@/stores/config-store"
import {
  SKILL_INSTALL_MODES,
  SKILL_SCOPES,
  type SkillOptions,
} from "@/stores/persisted-schema"
import { useUiStore } from "@/stores/ui-store"
import { InfoTip } from "./info-tip"
import { SkillOptionsPanel } from "./skill-options-panel"

const DOTS = ["top", "middle", "bottom"] as const

// `aria-disabled`, since `disabled` would suppress the `title` reason.
function PairCell({
  value,
  active,
  refusal,
  error = false,
  onPick,
}: {
  value: string
  active: boolean
  refusal: string | undefined
  error?: boolean
  onPick: () => void
}) {
  return (
    <ButtonGroupItem
      active={active}
      error={error}
      aria-disabled={refusal !== undefined || undefined}
      title={refusal}
      onClick={onPick}
    >
      {value}
    </ButtonGroupItem>
  )
}

// Selection is an overlay sibling of the controls, so none stops propagation.
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
  const provider = useUiStore((state) => state.provider)
  const togglePanel = useUiStore((state) => state.togglePanel)
  const openPanel = useUiStore((state) => state.openPanel)
  const previewSkill = useUiStore((state) => state.previewSkill)

  const { skill, entry, selected, incompatible } = view
  const open = openPanelSkillId === skill.id
  const inLastColumn = column === columns - 1
  const ejectOnly = isEjectOnly(skill.id)
  const cellRef = useRef<HTMLDivElement>(null)

  // The store's fallbacks, so the panel never shows one thing and saves another.
  const remembered = useConfigStore((state) => state.remembered[skill.id])
  const untouched = useMemo(() => freshEntry(skill.id), [skill.id])
  const options = entry ?? remembered ?? untouched
  // Chosen before the switch to Codex: kept, drawn as an error.
  const errored = selected && !offersPlacement(provider, options)

  const select = () => {
    // Tracked here because the store is never reached.
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

  const requestPanel = () => {
    if (!incompatible) togglePanel(skill.id)
  }

  const refusalFor = (patch: Partial<SkillOptions>) =>
    pressRefusal(provider, options, patch)

  const flip = (patch: Partial<SkillOptions>) => {
    if (incompatible || refusalFor(patch) !== undefined) return

    setSkillOption(skill.id, patchForPress(provider, patch))
  }

  // Presses inside are ignored, or the ••• would close then reopen.
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
      className={cn(
        "group/cell px-3 py-[0.6875rem]",
        open && "z-58",
        errored && "focus-within:z-50 hover:z-50"
      )}
    >
      <LatticeCellButton
        tabIndex={incompatible ? -1 : 0}
        aria-label={skill.displayName}
        aria-pressed={selected}
        aria-disabled={incompatible || undefined}
        title={view.incompatibleReason}
        onClick={select}
      />

      <div className="pointer-events-none relative z-2 flex items-start gap-2.5">
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
            {errored && (
              <span className="relative inline-flex flex-none self-center">
                <InfoTip
                  label={UNOFFERED_PLACEMENT_ERROR.lead}
                  glyph="warning"
                  flip={inLastColumn}
                  className="pointer-events-auto cursor-help text-error-ink outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <b className="font-medium text-error-ink">
                    {UNOFFERED_PLACEMENT_ERROR.lead}
                  </b>{" "}
                  {UNOFFERED_PLACEMENT_ERROR.detail}
                </InfoTip>
              </span>
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5 font-mono text-9 font-medium text-muted-foreground">
            <span className="truncate">{skill.description}</span>
          </div>
        </div>

        {/* Zero opacity, not absent, so revealing them cannot reflow. */}
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

      {/* Inert, so the overlay keeps the cell's clicks; groups opt back in. */}
      <div className="pointer-events-none relative z-1 mt-[0.5625rem] -ml-[0.3125rem] flex min-w-0 items-center gap-[0.625rem]">
        {ejectOnly ? (
          // An added skill has no plugin form; still catches the press.
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
              <PairCell
                key={mode}
                value={mode}
                active={options.install === mode}
                refusal={refusalFor({ install: mode })}
                onPick={() => flip({ install: mode })}
              />
            ))}
          </ButtonGroup>
        )}

        <ButtonGroup
          aria-label="Scope"
          className="pointer-events-auto flex-none"
        >
          {SKILL_SCOPES.map((scope) => (
            <PairCell
              key={scope}
              value={scope}
              active={options.scope === scope}
              refusal={refusalFor({ scope })}
              error={errored && options.scope === scope}
              onPick={() => flip({ scope })}
            />
          ))}
        </ButtonGroup>
      </div>

      {open && (
        <SkillOptionsPanel
          skillId={skill.id}
          sourceUrl={skill.sourceUrl}
          entry={options}
          flip={inLastColumn}
        />
      )}
    </LatticeCell>
  )
}
