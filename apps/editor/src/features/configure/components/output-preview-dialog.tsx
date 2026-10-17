import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogFooterNote,
  DialogHeader,
  DialogPane,
  DialogPaneSplitter,
  DialogPanes,
} from "@workspace/ui/components/dialog"
import { useEffect, useMemo, useState } from "react"

import { summarize } from "@/features/configure/lib/derive"
import { toSeedPayload } from "@/features/configure/lib/seed"
import { useCatalogStore } from "@/stores/catalog-store"
import { useUiStore } from "@/stores/ui-store"

import type { ConfigSelection } from "@/features/configure/lib/derive"
import type {
  OutputPreview,
  PreviewNode,
} from "@/features/configure/lib/output-preview"
import type { PreviewToken } from "@/features/configure/lib/render-tokens"
import type { Provider } from "@workspace/compile"
import type { SeedPayload } from "@workspace/matrix"
import type { KeyboardEvent } from "react"

// A stranger's bytes render as React text children, never as markup. The model
// and highlighter stay behind `import()`; the spec gates the static graph.

const FOOTER_SEPARATOR = " · "

const ROW_INDENT_PX = 14
const ROW_STEP_PX = 13

const ARROW_STEP: Record<string, number | undefined> = {
  ArrowDown: 1,
  ArrowUp: -1,
}

const ROW_SELECTOR = '[data-slot="preview-row"]'

const IDLE_FALLBACK_MS = 200

// The DOM types call this check unnecessary, but Safari before 18.4 lacks
// `requestIdleCallback` and is in the build target.
function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const idle = window.requestIdleCallback(run)
    return () => {
      window.cancelIdleCallback(idle)
    }
  }

  const timer = window.setTimeout(run, IDLE_FALLBACK_MS)
  return () => {
    window.clearTimeout(timer)
  }
}

// Prefetches the heavy chunks at idle, only once there is something to preview.
// The corpus is named because the model reaches it through a second `import()`.
function useWarmPreview(live: boolean) {
  useEffect(() => {
    if (!live) return

    return whenIdle(() => {
      void import("@workspace/compile/preview")
      void import("@/features/configure/lib/render-tokens").then((module) => {
        module.prefetchHighlighter()
      })
    })
  }, [live])
}

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; preview: OutputPreview }
  | { status: "failed"; message: string }

const failureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

// Built as soon as the entry point is live, so the dialog never opens blank.
function useOutputPreview(
  payload: SeedPayload,
  provider: Provider,
  live: boolean
): PreviewState {
  // Keyed by its inputs so "loading" is derived, not set in the effect.
  const [built, setBuilt] = useState<{
    payload: SeedPayload
    // The provider is not in the payload but changes the tree.
    provider: Provider
    state: PreviewState
  } | null>(null)

  useEffect(() => {
    if (!live) return

    const attempt = new AbortController()

    void (async () => {
      const state = await buildState(payload, provider)
      if (!attempt.signal.aborted) setBuilt({ payload, provider, state })
    })()

    return () => {
      attempt.abort()
    }
  }, [payload, provider, live])

  return built?.payload === payload && built.provider === provider
    ? built.state
    : { status: "loading" }
}

async function buildState(
  payload: SeedPayload,
  provider: Provider
): Promise<PreviewState> {
  try {
    const { buildOutputPreview } =
      await import("@/features/configure/lib/output-preview")
    return {
      status: "ready",
      preview: await buildOutputPreview(payload, provider),
    }
  } catch (error) {
    // A payload the CLI would refuse throws; its message is shown.
    return { status: "failed", message: failureMessage(error) }
  }
}

export function OutputPreviewDialog({ config }: { config: ConfigSelection }) {
  const dialog = useUiStore((state) => state.dialog)
  const setDialog = useUiStore((state) => state.setDialog)

  const live = summarize(config).skillCount > 0

  useWarmPreview(live)

  const seated = useCatalogStore((state) => state.matrix)
  const payload = useMemo(
    () => toSeedPayload(config),
    // `seated` is unread but remints the payload when the catalogue swaps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, seated]
  )
  const provider = useUiStore((state) => state.provider)
  const state = useOutputPreview(payload, provider, live)

  const open = dialog === "output"
  const fullscreen = useUiStore((state) => state.outputFullscreen)
  const exitFullscreen = useUiStore((state) => state.exitOutputFullscreen)

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (next) return

        // The first `esc` leaves fullscreen; the second closes.
        if (fullscreen && details.reason === "escape-key") {
          details.cancel()
          exitFullscreen()
          return
        }

        setDialog("none")
      }}
    >
      <DialogContent fullscreen={fullscreen} className="w-[47.5rem]">
        {open && <Preview state={state} />}
      </DialogContent>
    </Dialog>
  )
}

function Preview({ state }: { state: PreviewState }) {
  const selection = useUiStore((store) => store.outputSelection)
  const selectNode = useUiStore((store) => store.selectOutputNode)
  const fullscreen = useUiStore((store) => store.outputFullscreen)
  const toggleFullscreen = useUiStore((store) => store.toggleOutputFullscreen)
  const treeWidth = useUiStore((store) => store.outputTreeWidth)
  const setTreeWidth = useUiStore((store) => store.setOutputTreeWidth)

  const preview = state.status === "ready" ? state.preview : null
  const nodes = preview?.roots.flatMap((root) => root.nodes) ?? []
  // A stale selection is normal (scope flips move rows); fall back to the default.
  const selected =
    nodes.find((node) => node.id === selection) ??
    nodes.find((node) => node.id === preview?.defaultSelectionId)
  const positions = siblingPositions(nodes)

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = ARROW_STEP[event.key]
    if (step === undefined) return

    event.preventDefault()
    const rows = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(ROW_SELECTOR),
    ]
    // Identity comparison only; the element type is irrelevant.
    const from = rows.indexOf(document.activeElement as HTMLElement)
    const next = Math.min(Math.max(from + step, 0), rows.length - 1)
    rows[next]?.focus()
  }

  return (
    <>
      <DialogHeader
        title="Output preview"
        subtitle={
          <span data-slot="preview-subtitle" className="truncate">
            {selected ? `${selected.id} · ${markerFor(selected)}` : ""}
          </span>
        }
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
        onDoubleClick={toggleFullscreen}
      />

      <DialogPanes className="min-h-[26rem] overflow-hidden">
        <DialogPane
          side="tree"
          data-slot="preview-tree"
          role="tree"
          aria-label="Files this configuration writes"
          onKeyDown={moveFocus}
          className="[scrollbar-gutter:stable] overflow-x-hidden overflow-y-auto px-0 py-2.5"
          // The store holds design pixels; rem keeps the root sizing knob working.
          style={{ width: `${treeWidth / 16}rem` }}
        >
          {preview?.roots.flatMap((root, rootIndex) =>
            root.nodes.map((node, nodeIndex) => (
              <Row
                key={node.id}
                node={node}
                position={positions.get(node.id)}
                selected={node.id === selected?.id}
                spaced={rootIndex > 0 && nodeIndex === 0}
                onSelect={selectNode}
              />
            ))
          )}
        </DialogPane>

        <DialogPaneSplitter width={treeWidth} onWidth={setTreeWidth} />

        <ContentPane node={selected} failure={state} />
      </DialogPanes>

      <DialogFooter>
        <DialogFooterNote>
          <Stats preview={preview} />
        </DialogFooterNote>
        <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
      </DialogFooter>
    </>
  )
}

// Deliberately not the row's label vocabulary.
const markerFor = (node: PreviewNode) =>
  node.marker === "plugin" ? "reference only" : "new"

const NAME_CLASS = {
  root: "font-semibold text-ink-primary",
  directory: "font-medium text-ink-primary",
  file: "font-normal text-track-ink",
} as const

const rankOf = (node: PreviewNode): keyof typeof NAME_CLASS => {
  if (node.depth === 0) return "root"
  return node.marker === null ? "directory" : "file"
}

type RowPosition = { index: number; total: number }

const NO_PARENT = ""

// Rows are flat DOM siblings, so ARIA needs explicit posinset/setsize. A row's
// parent is the nearest shallower row above it, not its consecutive run.
function siblingPositions(
  nodes: readonly PreviewNode[]
): Map<string, RowPosition> {
  const nearestAtDepth = new Map<number, string>()
  const siblings = new Map<string, string[]>()

  for (const node of nodes) {
    nearestAtDepth.set(node.depth, node.id)
    const parent = nearestAtDepth.get(node.depth - 1) ?? NO_PARENT
    siblings.set(parent, [...(siblings.get(parent) ?? []), node.id])
  }

  return new Map(
    [...siblings.values()].flatMap((ids) =>
      ids.map((id, index): [string, RowPosition] => [
        id,
        { index: index + 1, total: ids.length },
      ])
    )
  )
}

function Row({
  node,
  position,
  selected,
  spaced,
  onSelect,
}: {
  node: PreviewNode
  position: RowPosition | undefined
  selected: boolean
  spaced: boolean
  onSelect: (path: string) => void
}) {
  return (
    <button
      type="button"
      role="treeitem"
      aria-level={node.depth + 1}
      {...(position && {
        "aria-posinset": position.index,
        "aria-setsize": position.total,
      })}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      data-slot="preview-row"
      data-path={node.id}
      {...(node.marker !== null && { "data-marker": node.marker })}
      onClick={() => onSelect(node.id)}
      style={{ paddingLeft: ROW_INDENT_PX + node.depth * ROW_STEP_PX }}
      className={`flex h-[1.1875rem] w-full cursor-pointer items-baseline pr-6 text-left whitespace-nowrap outline-none focus-visible:ring-1 focus-visible:ring-ring ${
        selected ? "bg-wash" : "hover:bg-row-hover"
      } ${spaced ? "mt-[0.5625rem]" : ""}`}
    >
      <span
        data-slot="preview-row-name"
        className={`min-w-0 flex-[0_1_auto] truncate font-mono text-9_5 ${
          selected ? "font-normal text-brand-ink" : NAME_CLASS[rankOf(node)]
        }`}
      >
        {node.name}
      </span>
      {node.marker !== null && (
        <span
          className={`ml-auto flex-none pl-2.5 font-mono text-7_5 font-normal ${
            node.marker === "eject" ? "text-brand-ink" : "text-roster-empty"
          }`}
        >
          {node.marker}
        </span>
      )}
    </button>
  )
}

const uncoloured = (body: string): PreviewToken[][] =>
  body === "" ? [] : body.split("\n").map((line) => [{ content: line }])

// Plain text first, highlighted tokens when they arrive; if Shiki never loads
// the text stays readable.
function ContentPane({
  node,
  failure,
}: {
  node: PreviewNode | undefined
  failure: PreviewState
}) {
  // Cached by path for the dialog's lifetime, so revisits paint coloured at once.
  const [coloured, setColoured] = useState<Record<string, PreviewToken[][]>>({})

  const body = node?.body ?? ""
  const lang = node?.lang ?? "text"
  const id = node?.id ?? ""
  const known = coloured[id]

  useEffect(() => {
    if (body === "" || known !== undefined) return

    const attempt = new AbortController()

    void (async () => {
      const { renderTokens } =
        await import("@/features/configure/lib/render-tokens")
      const lines = await renderTokens(body, lang)
      if (!attempt.signal.aborted) {
        setColoured((read) => ({ ...read, [id]: lines }))
      }
    })()

    return () => {
      attempt.abort()
    }
  }, [id, body, lang, known])

  const lines = known ?? uncoloured(body)

  return (
    <DialogPane
      side="content"
      data-slot="preview-content"
      className="overflow-auto pt-3.5 pb-4.5 font-mono text-9_5 leading-[1.75] font-normal text-ink-2"
    >
      {failure.status === "failed" && (
        <p role="alert" className="whitespace-pre-wrap text-destructive">
          {failure.message}
        </p>
      )}
      {lines.map((tokens, line) => (
        <div
          key={line}
          data-slot="preview-line"
          className="min-h-[1.0625rem] whitespace-pre-wrap"
        >
          {tokens.map((token, index) => (
            <TokenRun key={index} token={token} />
          ))}
        </div>
      ))}
    </DialogPane>
  )
}

function TokenRun({ token }: { token: PreviewToken }) {
  if (token.placeholder === true)
    return (
      // Not the grammar's literal colour, which would read as a chosen value.
      <span data-slot="preview-placeholder" className="text-subtle">
        {token.content}
      </span>
    )

  if (token.color === undefined) return token.content

  return (
    <span data-slot="preview-token" style={{ color: token.color }}>
      {token.content}
    </span>
  )
}

function Stats({ preview }: { preview: OutputPreview | null }) {
  if (!preview) return null

  const ejected = preview.roots
    .flatMap((root) => root.nodes)
    .filter((node) => node.marker === "eject").length

  return (
    <>
      <span>
        {[
          `${preview.fileCount} files`,
          `${ejected} ejected`,
          `agents-inc v${preview.corpusVersion}`,
        ].join(FOOTER_SEPARATOR)}
      </span>
      <p className="pt-1">
        what installing this configuration on a machine with no existing
        agents-inc installation writes, when it is run from a project directory.
        The project directory&apos;s name, and its relative import to the global
        config, are computed on that machine — named here rather than guessed.
        Drawn against the catalogue on screen, which a machine carrying its own
        local skills does not have.
      </p>
    </>
  )
}
