import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogFooterNote,
  DialogHeader,
  DialogPane,
  DialogPanes,
} from "@workspace/ui/components/dialog"
import { Fragment, useEffect, useMemo, useState } from "react"

import { summarize } from "@/features/configure/lib/derive"
import { toSeedPayload } from "@/features/configure/lib/seed"
import { useUiStore } from "@/stores/ui-store"

import type { ConfigSelection } from "@/features/configure/lib/derive"
import type {
  OutputPreview,
  PreviewNode,
} from "@/features/configure/lib/output-preview"
import type { PreviewToken } from "@/features/configure/lib/render-tokens"
import type { SeedPayload } from "@workspace/matrix"
import type { KeyboardEvent } from "react"

/**
 * WHAT AN INSTALL WRITES, BEFORE ANYTHING IS WRITTEN.
 *
 * Two roots in one tree — `~/` and `./` — because scope separates itself:
 * flipping a sub-agent's scope word in the roster visibly moves its `.md` from
 * one root to the other, with no tab bar and no breadcrumb doing any of the
 * work. The header IS the breadcrumb, and that is the whole of the decision and
 * its stated cost.
 *
 * ── The rendering-safety decision, arriving in a second dialog ────────────
 *
 * `skill-contents-dialog.tsx` decided once that a stranger's bytes reach the
 * screen as text: no markdown renderer, no sanitiser, and no raw-HTML escape
 * hatch anywhere on the path. Syntax highlighting is the one change that could
 * have broken it — the markup-returning half of Shiki's API returns a string,
 * and there is exactly one way to put a string of markup on screen — so the
 * pane renders `{ content, color }` objects as ordinary React children instead,
 * and a stranger's file has no grammar run over it at all. Both names are
 * asserted absent from this file, by name, in its own spec.
 *
 * ── What is behind `import()`, and why ────────────────────────────────────
 *
 * Neither the model nor the highlighter may be reached statically from here.
 * The vendored agent corpus, the Liquid engine and Shiki are the three heaviest
 * things this feature adds and every one of them is wanted only behind a click;
 * this component is on the first-paint path, so a static import of either
 * module would put all three there. `output-preview-dialog.test.ts` is the gate,
 * and it covers the transitive case a grep of the imports above could not.
 */

// Files an install writes, ejected directories, the release the corpus was
// vendored at, and the sentence that says what all of that is a preview OF.
const FOOTER_SEPARATOR = " · "

// The design's flush edge and one step per level: `padding-left: 14 + depth * 13`.
const ROW_INDENT_PX = 14
const ROW_STEP_PX = 13

const ARROW_STEP: Record<string, number | undefined> = {
  ArrowDown: 1,
  ArrowUp: -1,
}

const ROW_SELECTOR = '[data-slot="preview-row"]'

/**
 * Safari shipped `requestIdleCallback` far later than the browsers this app was
 * measured on, so a macrotask stands in where it is missing. The stand-in's job
 * is to be off the render path rather than to be genuinely idle.
 */
const IDLE_FALLBACK_MS = 200

/**
 * Run when the page has nothing better to do, and answer how to call it off.
 *
 * The `typeof` test is a runtime one that the DOM types say is unnecessary:
 * `lib.dom` declares `requestIdleCallback` on `Window` unconditionally, so
 * `"requestIdleCallback" in window` narrows the other branch to `never` and the
 * fallback stops compiling. Safari shipped it in 18.4, which is inside this
 * app's target — Vite 8 defaults to baseline-widely-available and nothing here
 * overrides it — so the branch the types call dead is one real visitors take.
 */
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

/**
 * The two heaviest chunks behind the preview, fetched once the page has nothing
 * better to do — and only for a configuration there is something to preview OF.
 *
 * BOTH HALVES OF THAT WERE UNTRUE AND THE DOCBLOCK CLAIMED THE FIRST ANYWAY.
 * This was a bare `useEffect(…, [])` on a component the roster mounts
 * unconditionally, so every visitor fetched the vendored corpus, the Liquid
 * engine, Shiki and its three grammars — the `compile` chunk at 186 KB gzipped
 * plus six vendor chunks, 290 KB in all on 2026-08-26 — including one who had
 * selected nothing and whose entry point was disabled. `live` is the same rule
 * that disables the entry point, and the idle callback is the one the previous
 * note described and the code did not have.
 *
 * The model is deliberately NOT warmed here. `useOutputPreview` imports it
 * immediately for exactly the configurations this hook now fires for, so
 * warming it a beat later could only ever be a no-op. The corpus IS named,
 * because the model reaches it through a second `import()` of its own and would
 * otherwise start fetching only once the model's chunk had arrived — measured
 * against a cold dev server at ~500ms for the model and ~300ms for the corpus,
 * which is 800ms of empty sheet in series and 500ms in parallel. What this
 * component may not reach is its STATIC graph, and its own spec is the gate on
 * that.
 */
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

/**
 * The preview for a configuration, prepared before it is asked for.
 *
 * It is built as soon as the entry point is live rather than when the dialog
 * opens, and that is a decision about the CTA rather than an optimisation: the
 * design's reason for putting this above Install is "you preview, then you
 * install", and a step that opens onto a blank sheet while a chunk downloads is
 * not a step. The work is one lazy import and a handful of Liquid renders, and
 * it is thrown away and redone whenever the configuration moves.
 */
function useOutputPreview(payload: SeedPayload, live: boolean): PreviewState {
  // Keyed by the payload it was built for, so "still building" is DERIVED from
  // the two rather than written into state by the effect. A `setState` in an
  // effect body is a cascading render, and it would also let an older build
  // that resolved late overwrite a newer one.
  const [built, setBuilt] = useState<{
    payload: SeedPayload
    state: PreviewState
  } | null>(null)

  useEffect(() => {
    if (!live) return

    const attempt = new AbortController()

    void (async () => {
      const state = await buildState(payload)
      if (!attempt.signal.aborted) setBuilt({ payload, state })
    })()

    return () => {
      attempt.abort()
    }
  }, [payload, live])

  return built?.payload === payload ? built.state : { status: "loading" }
}

async function buildState(payload: SeedPayload): Promise<PreviewState> {
  try {
    const { buildOutputPreview } =
      await import("@/features/configure/lib/output-preview")
    return { status: "ready", preview: await buildOutputPreview(payload) }
  } catch (error) {
    // A payload the CLI would refuse — a project-scoped skill on a sub-agent
    // resting at global — throws in the decode rather than drawing a quieter
    // configuration than the one on screen. The refusal names every unwritable
    // pair, so it is shown rather than swallowed.
    return { status: "failed", message: failureMessage(error) }
  }
}

export function OutputPreviewDialog({ config }: { config: ConfigSelection }) {
  const dialog = useUiStore((state) => state.dialog)
  const setDialog = useUiStore((state) => state.setDialog)

  // The same rule the entry point is disabled by: nothing selected is nothing
  // to write, so there is nothing to prepare and nothing to fetch either.
  const live = summarize(config).skillCount > 0

  useWarmPreview(live)

  const payload = useMemo(() => toSeedPayload(config), [config])
  const state = useOutputPreview(payload, live)

  const open = dialog === "output"

  return (
    <Dialog open={open} onOpenChange={(next) => !next && setDialog("none")}>
      {/* 760px. `wide` is 620px, which is the widest the shell otherwise goes,
          and this sheet holds a 250px column plus a file. */}
      <DialogContent className="w-[47.5rem]">
        {open && <Preview state={state} />}
      </DialogContent>
    </Dialog>
  )
}

function Preview({ state }: { state: PreviewState }) {
  const selection = useUiStore((store) => store.outputSelection)
  const selectNode = useUiStore((store) => store.selectOutputNode)

  const preview = state.status === "ready" ? state.preview : null
  const nodes = preview?.roots.flatMap((root) => root.nodes) ?? []
  // A path that no longer names a row is the normal case, not an error: the
  // tree is rebuilt from live state every time it is opened, so a scope flip
  // relocates rows between one opening and the next. Falling back beats
  // blanking, which would read as an empty file.
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
      />

      {/* Each column scrolls on its own: a long file must not carry the tree
          off the top of the sheet with it. */}
      <DialogPanes className="min-h-[26rem] overflow-hidden">
        <DialogPane
          side="tree"
          data-slot="preview-tree"
          role="tree"
          aria-label="Files this configuration writes"
          onKeyDown={moveFocus}
          // `scrollbar-gutter` plus `overflow-x: hidden` plus each row's
          // `padding-right` are one decision in three parts: the state labels
          // clear the gutter, and a long filename ellipsizes rather than
          // widening the column.
          className="[scrollbar-gutter:stable] overflow-x-hidden overflow-y-auto px-0 py-2.5"
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

/**
 * The header's marker is binary, and its vocabulary is disjoint from the tree's:
 * `reference only` appears here and is never a row label, and `new` / `plugin` /
 * `eject` appear on a row and never here. A plugin node is where the difference
 * is load-bearing — the row says how it installs, the header says what the pane
 * is showing.
 */
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

/** A row's place among the siblings sharing its parent, one-based, as ARIA counts. */
type RowPosition = { index: number; total: number }

/** The key the roots themselves are grouped under — they have no parent row. */
const NO_PARENT = ""

/**
 * Where every row sits among its own siblings.
 *
 * `aria-level` alone is half a tree. These rows are DOM siblings — one flat run
 * of buttons, with `padding-left` doing all the nesting — so nothing structural
 * says how many rows share a level or which one this is, and ARIA requires
 * `aria-posinset` and `aria-setsize` alongside `aria-level` for exactly that
 * shape. Without them a screen reader announces the depth and nothing about how
 * far through the depth the listener has got.
 *
 * A row's parent is the nearest row above it one level shallower, which is why
 * this cannot group consecutive runs: `agents/` and `skills/` are siblings with
 * `web-developer.md` sitting between them.
 */
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
      // One tab stop for the whole tree; the arrows move within it.
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
        // Amber for `eject` alone, which is the plugin/eject decision made
        // visible: it means the user chose to own a copy.
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

/** The file as its own lines, before the highlighter has anything to say. */
const uncoloured = (body: string): PreviewToken[][] =>
  body === "" ? [] : body.split("\n").map((line) => [{ content: line }])

/**
 * The selected file's bytes, one element per line.
 *
 * Painted in two passes on purpose. The first is the file's own text, rendered
 * synchronously, so the pane never shows an empty sheet for a file that has
 * one; the second replaces it with the highlighter's tokens when they arrive.
 * That is also the degrade path B4.3 requires — a Shiki chunk that never loads
 * leaves readable text rather than a blank pane, which would be a lie about
 * what the CLI writes.
 */
function ContentPane({
  node,
  failure,
}: {
  node: PreviewNode | undefined
  failure: PreviewState
}) {
  // Every file coloured so far, by path. Clicking back to one already read
  // paints it in the same commit as the click rather than through the pane's
  // uncoloured first pass, which is what the tree invites — it is a list of
  // files to move between. Its lifetime is this dialog's: the component is
  // mounted only while the sheet is open, and the configuration cannot move
  // underneath it while it is.
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
          // Lines have no identity of their own — the file is redrawn whole
          // whenever the selection moves — so the index is the key.
          key={line}
          data-slot="preview-line"
          className="min-h-[1.0625rem] whitespace-pre-wrap"
        >
          {tokens.map((token, index) =>
            token.placeholder === true ? (
              // The one run painted from the design rather than from the
              // grammar. The ramp would give it the literal colour, which reads
              // as a chosen value — and a value nobody has chosen yet is what
              // this run says.
              <span
                key={index}
                data-slot="preview-placeholder"
                className="text-subtle"
              >
                {token.content}
              </span>
            ) : token.color === undefined ? (
              <Fragment key={index}>{token.content}</Fragment>
            ) : (
              <span
                key={index}
                data-slot="preview-token"
                style={{ color: token.color }}
              >
                {token.content}
              </span>
            )
          )}
        </div>
      ))}
    </DialogPane>
  )
}

/**
 * The stat line, and the sentence that says what the whole sheet is a preview OF.
 *
 * None of the five things a preview cannot know is papered over here. It cannot
 * see the disk it would install onto, so it is scoped to a clean machine and
 * says so as a claim rather than a hedge; it cannot know the project directory
 * or the relative import to `~/.claude-src`, so both are named rather than
 * guessed; it draws against the catalogue on screen, which a machine carrying
 * locally-authored skills does not have; and a compiled sub-agent's first body
 * line is stamped with the release the corpus was vendored at, which is a real
 * difference for a visitor on an older CLI rather than one to hide.
 */
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
        agents-inc installation writes. The project directory&apos;s name, and
        its relative import to the global config, are computed on that machine —
        named here rather than guessed. Drawn against the catalogue on screen,
        which a machine carrying its own local skills does not have.
      </p>
    </>
  )
}
