/**
 * Fails `vite build` when first paint (gzipped entry, its static imports and
 * all CSS) exceeds the budget. `import()`-only chunks are not counted; keeping
 * them lazy is the point.
 */

import { isAbsolute } from "node:path"
import { gzipSync } from "node:zlib"
import type { Plugin, Rolldown } from "vite"

const KIBIBYTE = 1024

const FIRST_PAINT_BUDGET_BYTES = 352 * KIBIBYTE

const GZIP_LEVEL = 9

type EmittedChunk = {
  fileName: string
  code: string
  isEntry: boolean
  imports: readonly string[]
  moduleIds: readonly string[]
}

type Stylesheet = { fileName: string; source: string }

type Payload = {
  parts: readonly { fileName: string; gzipBytes: number }[]
  gzipBytes: number
}

const gzipBytes = (source: string): number =>
  gzipSync(source, { level: GZIP_LEVEL }).length

const kb = (bytes: number): string => `${(bytes / KIBIBYTE).toFixed(1)} KB`

const asPosix = (moduleId: string): string => moduleId.replaceAll("\\", "/")

const isDependency = (moduleId: string): boolean =>
  asPosix(moduleId).includes("/node_modules/")

/** Absolute paths only, which excludes the bundler's virtual modules. */
const isFirstPartySource = (moduleId: string): boolean =>
  isAbsolute(moduleId) && !isDependency(moduleId)

const staticallyReachable = (
  chunks: readonly EmittedChunk[]
): readonly EmittedChunk[] => {
  const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
  const reached = new Map<string, EmittedChunk>()

  const follow = (fileName: string): void => {
    const chunk = byFileName.get(fileName)
    if (chunk === undefined || reached.has(fileName)) return
    reached.set(fileName, chunk)
    chunk.imports.forEach(follow)
  }

  chunks
    .filter((chunk) => chunk.isEntry)
    .forEach((chunk) => follow(chunk.fileName))
  return [...reached.values()]
}

const firstPaintPayload = (
  chunks: readonly EmittedChunk[],
  stylesheets: readonly Stylesheet[]
): Payload => {
  const parts = [
    ...chunks.map((chunk) => ({
      fileName: chunk.fileName,
      gzipBytes: gzipBytes(chunk.code),
    })),
    ...stylesheets.map((sheet) => ({
      fileName: sheet.fileName,
      gzipBytes: gzipBytes(sheet.source),
    })),
  ]

  return {
    parts: [...parts].sort((a, b) => b.gzipBytes - a.gzipBytes),
    gzipBytes: parts.reduce((total, part) => total + part.gzipBytes, 0),
  }
}

const overBudgetMessage = (payload: Payload): string =>
  [
    `First paint is ${kb(payload.gzipBytes)} gzipped, ${kb(payload.gzipBytes - FIRST_PAINT_BUDGET_BYTES)} over the ${kb(FIRST_PAINT_BUDGET_BYTES)} budget.`,
    ...payload.parts.map(
      (part) => `  ${part.fileName} — ${kb(part.gzipBytes)}`
    ),
    "Load the new weight on demand — a dynamic import keeps it out of this",
    "number entirely — before considering the budget in scripts/first-paint-budget.ts.",
  ].join("\n")

/**
 * Own source and dependencies change at different rates, so they must not share
 * a chunk.
 */
const mixesOwnSourceWithDependencies = (chunk: EmittedChunk): boolean =>
  chunk.moduleIds.some(isFirstPartySource) && chunk.moduleIds.some(isDependency)

const mixedChunkMessage = (chunk: EmittedChunk): string =>
  [
    `${chunk.fileName} carries this app's own source and its dependencies together,`,
    "so every deploy makes returning visitors re-download dependencies that did not change.",
    "Check `build.rolldownOptions.output.codeSplitting` in vite.config.ts — a group that",
    "stopped matching (a renamed directory, a `/` where `[\\\\/]` was meant) reads exactly like this.",
  ].join("\n")

const emittedChunks = (bundle: Rolldown.OutputBundle): EmittedChunk[] =>
  Object.values(bundle).flatMap((item) =>
    item.type === "chunk"
      ? [
          {
            fileName: item.fileName,
            code: item.code,
            isEntry: item.isEntry,
            imports: item.imports,
            moduleIds: Object.keys(item.modules),
          },
        ]
      : []
  )

const emittedStylesheets = (bundle: Rolldown.OutputBundle): Stylesheet[] =>
  Object.values(bundle).flatMap((item) =>
    item.type === "asset" && item.fileName.endsWith(".css")
      ? [{ fileName: item.fileName, source: String(item.source) }]
      : []
  )

export function firstPaintBudget(): Plugin {
  return {
    name: "first-paint-budget",
    apply: "build",
    generateBundle(_options, bundle) {
      const chunks = emittedChunks(bundle)

      const mixed = chunks.find(mixesOwnSourceWithDependencies)
      if (mixed !== undefined) throw new Error(mixedChunkMessage(mixed))

      const payload = firstPaintPayload(
        staticallyReachable(chunks),
        emittedStylesheets(bundle)
      )
      if (payload.gzipBytes > FIRST_PAINT_BUDGET_BYTES) {
        throw new Error(overBudgetMessage(payload))
      }
    },
  }
}
