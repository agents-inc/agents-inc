import type { RefObject } from "react"

import type { DomainTab } from "@/features/configure/lib/derive"
import { DOMAIN_TAB } from "@/features/configure/lib/use-active-domain"
import { useWideViewport } from "@/lib/viewport"

// Each cell draws its own baseline, so hover darkens one segment. The current
// tab draws the same hairline as the rest: the indicator is its only mark.
const CELL_RULE =
  "shadow-[inset_0_-1px_0_var(--color-hairline)] hover:shadow-[inset_0_-1px_0_var(--color-field-border)] data-active:hover:shadow-[inset_0_-1px_0_var(--color-hairline)]"

// Pinned, the strip's own hairline replaces the cells'.
const CELL_RULE_PINNED =
  "group-data-pinned/bar:h-12 group-data-pinned/bar:shadow-none group-data-pinned/bar:hover:shadow-[inset_0_-1px_0_var(--color-field-border)]"

// Pinned, only the fill and hairline bleed: the tabs keep the gutter.
const STRIP_PINNED =
  "group-data-pinned/bar:mt-0 group-data-pinned/bar:bg-strip-stuck group-data-pinned/bar:shadow-[inset_0_-1px_0_var(--color-hairline)]"

function DomainTabButton({
  tab,
  active,
  counted,
  onPick,
}: {
  tab: DomainTab
  active: boolean
  counted: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      // A pick jumps rather than filters, so "current", not "pressed".
      aria-current={active}
      {...(active && { "data-active": "" })}
      {...{ [DOMAIN_TAB]: tab.id }}
      onClick={onPick}
      // `px-1` rather than the design's 15px: nine domains share the row, and
      // the design's inset pushes the long names through their ellipsis.
      className={`group box-border flex h-[2.875rem] min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 px-1 py-3 whitespace-nowrap outline-none focus-visible:ring-1 focus-visible:ring-ring ${CELL_RULE} ${CELL_RULE_PINNED}`}
    >
      <span className="overflow-hidden font-mono text-11 leading-none font-semibold tracking-[.12em] text-ellipsis text-muted-foreground uppercase group-hover:text-ink-2 group-data-active:text-ink-primary">
        {tab.label}
      </span>
      {counted && (
        <span
          aria-hidden="true"
          className="flex-none font-mono text-9 leading-none font-normal text-muted-foreground transition-colors duration-[240ms] ease-in group-data-active:text-brand-ink"
        >
          {tab.skillCount}
        </span>
      )}
    </button>
  )
}

// `use-active-domain.ts` positions the indicator.
export function DomainTabs({
  tabs,
  activeDomain,
  onPick,
  indicatorRef,
}: {
  tabs: DomainTab[]
  activeDomain: string | null
  onPick: (domainId: DomainTab["id"]) => void
  indicatorRef: RefObject<HTMLSpanElement | null>
}) {
  const counted = useWideViewport()

  return (
    <div
      role="group"
      aria-label="Domains"
      className={`relative mt-2.5 flex items-stretch px-gutter ${STRIP_PINNED}`}
    >
      {tabs.map((tab) => (
        <DomainTabButton
          key={tab.id}
          tab={tab}
          active={tab.id === activeDomain}
          counted={counted}
          onPick={() => onPick(tab.id)}
        />
      ))}
      <span
        ref={indicatorRef}
        aria-hidden="true"
        data-slot="domain-indicator"
        className="pointer-events-none absolute bottom-0 left-0 h-[2px] bg-brand"
      />
    </div>
  )
}
