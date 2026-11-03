import { useNavigate } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import {
  ButtonGroup,
  ButtonGroupItem,
} from "@workspace/ui/components/button-group"
import { Glyph } from "@workspace/ui/components/glyph"
import { Input } from "@workspace/ui/components/input"
import { useRef, type MouseEvent } from "react"

import {
  catalogueSkillCount,
  summarize,
  type DomainTab,
} from "@/features/configure/lib/derive"
import { useActiveDomain } from "@/features/configure/lib/use-active-domain"
import {
  scrollToDomain,
  useDomainOnArrival,
} from "@/features/configure/lib/use-domain-scroll"
import {
  useBarStuckAttribute,
  usePinned,
  usePinnedAttribute,
} from "@/features/configure/lib/use-pinned"
import { useScrollClearance } from "@/features/configure/lib/use-scroll-clearance"
import type { ConfigureSearch } from "@/routes/search"
import { useConfigStore } from "@/stores/config-store"
import { useUiStore } from "@/stores/ui-store"
import { DomainTabs } from "./domain-tabs"

// The pinned field runs under the add block, so the pair keeps clear of it by
// the block's measured width: the label sets it, and no constant could.
const ADD_BLOCK_WIDTH = "--add-block-width"

const publishBlockWidth = (block: HTMLElement | null) => {
  const row = block?.parentElement
  if (!block || !row) return
  const observer = new ResizeObserver(() =>
    row.style.setProperty(
      ADD_BLOCK_WIDTH,
      `${block.getBoundingClientRect().width}px`
    )
  )
  observer.observe(block)
  return () => observer.disconnect()
}

// The gap to the pair is the input's own padding, so a press in it takes the
// caret. Pinned with no pair, the input runs on under the add block.
const searchInset = (stuck: boolean, anySelected: boolean) => {
  const left = stuck ? "pl-gutter" : "pl-[0.8125rem]"
  if (anySelected) return `${left} pr-3`
  return `${left} ${stuck ? "pr-0" : "pr-[0.8125rem]"}`
}

function SelectedOnlyPair({
  selectedCount,
  selectedOnly,
  onDark,
  onPick,
}: {
  selectedCount: number
  selectedOnly: boolean
  onDark: boolean
  onPick: (selectedOnly: boolean) => void
}) {
  const cells = [
    { only: false, word: "all", count: catalogueSkillCount() },
    { only: true, word: "selected", count: selectedCount },
  ] as const

  return (
    <ButtonGroup
      aria-label="Show only selected skills"
      // Pinned, the pair stops short of the add block: its width plus gutter,
      // less the field's border.
      className="relative mr-[0.8125rem] flex-none self-center group-data-pinned/bar:mr-[calc(var(--add-block-width)_+_var(--spacing-gutter)_+_0.625rem_-_1px)]"
    >
      {cells.map(({ only, word, count }) => (
        <ButtonGroupItem
          key={word}
          size="segment"
          preset="search"
          tone={onDark ? "onDark" : "plain"}
          active={selectedOnly === only}
          onClick={() => onPick(only)}
        >
          {/* One inline run, so the space survives in the accessible name. */}
          <span>
            {word} <span className="opacity-70">{count}</span>
          </span>
        </ButtonGroupItem>
      ))}
    </ButtonGroup>
  )
}

export function FilterBar({
  search,
  tabs,
  renderedDomains,
}: {
  search: ConfigureSearch
  tabs: DomainTab[]
  renderedDomains: readonly string[]
}) {
  const navigate = useNavigate({ from: "/" })
  const setDialog = useUiStore((state) => state.setDialog)
  const selectedCount = useConfigStore((state) => summarize(state).skillCount)

  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)

  // A domain pick has already scrolled; `replace` so typing skips the history.
  const update = (patch: Partial<ConfigureSearch>) =>
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
      resetScroll: false,
      replace: "q" in patch,
    })

  // React state for the colours; `data-pinned` for the geometry, which a
  // measurement mid-jump cannot wait a render for.
  const stuck = usePinned(wrapRef)
  useBarStuckAttribute(stuck)
  usePinnedAttribute(wrapRef)

  useScrollClearance(wrapRef, "top")

  // The scroll position owns the current tab, a pick included.
  const activeDomain =
    useActiveDomain(wrapRef, indicatorRef) ?? tabs[0]?.id ?? null

  useDomainOnArrival(wrapRef, search.domain, renderedDomains)

  const pick = (domainId: DomainTab["id"]) => {
    scrollToDomain(wrapRef.current, domainId)
    update({ domain: domainId })
  }

  const focusSearch = (event: MouseEvent<HTMLDivElement>) => {
    const input = inputRef.current
    if (event.target !== event.currentTarget || !input) return
    event.preventDefault()
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  }

  const anySelected = selectedCount > 0

  return (
    <>
      {/* Static and zero-height: where the bar pins, whatever shape it takes. */}
      <div data-slot="pin-sentinel" />
      <div
        ref={wrapRef}
        data-slot="filter-bar"
        // A column, so the band and strip margins do not collapse.
        className="group/bar sticky top-0 z-60 -mx-gutter flex flex-col bg-column"
      >
        <div
          data-slot="filter-band"
          // A margin below, since padding would paint dark with the band.
          // Pinned, the left gutter moves onto the field to take the caret.
          className={`relative mb-3 pr-gutter transition-[padding,background-color] duration-150 group-data-pinned/bar:mb-0 group-data-pinned/bar:h-[4.375rem] ${
            stuck ? "bg-ink pl-0" : "pl-gutter"
          }`}
        >
          <div
            className={`flex h-full justify-end gap-2.5 ${
              stuck ? "items-center" : "items-stretch"
            }`}
          >
            <div
              data-slot="search-field"
              onMouseDown={focusSearch}
              // Pinned, it is the whole band, under the `relative` add block.
              className={`flex min-w-0 flex-1 items-stretch border group-data-pinned/bar:absolute group-data-pinned/bar:inset-0 ${
                stuck
                  ? "border-transparent bg-transparent"
                  : "border-field-border bg-cell"
              }`}
            >
              <Input
                ref={inputRef}
                onDark={stuck}
                className={`py-[0.6875rem] leading-[1.125rem] transition-[padding] duration-150 ${searchInset(stuck, anySelected)}`}
                value={search.q}
                placeholder="search skills"
                aria-label="Search skills"
                onChange={(event) => update({ q: event.target.value })}
              />

              {anySelected && (
                <SelectedOnlyPair
                  selectedCount={selectedCount}
                  selectedOnly={search.sel}
                  onDark={stuck}
                  onPick={(selectedOnly) => update({ sel: selectedOnly })}
                />
              )}
            </div>

            <Button
              ref={publishBlockWidth}
              variant="block"
              onDark={stuck}
              className="relative gap-2"
              onClick={() => setDialog("add")}
            >
              <Glyph name="plus" />
              Add skill
            </Button>
          </div>
        </div>

        <DomainTabs
          tabs={tabs}
          activeDomain={activeDomain}
          onPick={pick}
          indicatorRef={indicatorRef}
        />
      </div>
      {/* Gives back the height the bar gains as it pins, in CSS: a measured
          hold lets scroll anchoring move the page. Pinned heights less resting
          ones. */}
      <div
        data-slot="pin-hold"
        className="[[data-pinned]+&]:-mt-[calc(4.375rem_+_3rem_-_2px_-_2.5rem_-_0.75rem_-_0.625rem_-_2.875rem)]"
      />
    </>
  )
}
