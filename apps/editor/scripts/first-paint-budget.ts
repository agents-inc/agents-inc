/**
 * Two claims about what a first-time visitor has to download before the editor
 * renders, both checked against the emitted bundle rather than against the
 * intent that produced it. It runs inside `vite build`, so `bun run build` is
 * the gate — there is no separate command to remember and no way to land a
 * regression through a green build.
 *
 * WHY A BUDGET RATHER THAN ASSERTIONS PER DEPENDENCY. The defect this exists
 * to catch has one shape and many spellings: something that is not needed for
 * the first paint ends up on the first-paint path. A static import of a
 * library that is only used behind a click, an upgrade that doubles a
 * dependency, a chunking rule that quietly pulls a *dynamically* imported
 * module back into the static graph — that last one is not hypothetical, it is
 * what a `test: /node_modules/` catch-all group without `entriesAware` did to
 * `posthog-js` while this was being written, adding 74 KB to first paint with
 * every other check green. One number over the whole payload catches all three;
 * a list of per-package assertions catches only the spellings someone thought
 * of.
 *
 * WHAT COUNTS AS THE PAYLOAD. The entry chunk, every chunk it imports
 * statically (transitively — those are what the HTML `modulepreload`s), and
 * every stylesheet, because the stylesheet blocks rendering too. A chunk
 * reached only through `import()` is deliberately NOT counted: keeping it out
 * is what the budget is meant to reward.
 *
 * WHY GZIP. Nothing here is served uncompressed, so raw bytes describe a
 * transfer that never happens. Cloudflare negotiates brotli with every browser
 * that matters and gzip with the rest, and brotli at quality 11 measured ~15%
 * smaller than gzip on this bundle — so gzip is the conservative reading of the
 * two and the cheap one: ~60ms for the whole payload against ~2s for brotli,
 * on every build.
 *
 * THE BUDGET IS A RECORD OF A MEASURED COST, NOT A TARGET. It sits a little
 * above what the bundle costs today so that ordinary work does not trip it and
 * real growth does. Raising it is allowed — but as a deliberate edit with a
 * reason, after asking whether the new weight could be loaded on demand
 * instead.
 */

import { isAbsolute } from "node:path"
import { gzipSync } from "node:zlib"
import type { Plugin, Rolldown } from "vite"

const KIBIBYTE = 1024

/**
 * Measured on 2026-08-29 at 336.0 KB under `bun`, and RAISED from 336 to 344 on
 * that reading. Naming the runtime beside a figure is what makes two readings
 * comparable: `bun` and `npx` agreed at the 2026-08-26 reading of 331.6 KB,
 * where the 2026-08-21 pair had been ~2% apart.
 *
 * WHAT THE 4.4 KB BOUGHT, because this file asks for that before a raise:
 * accounts (a session store, three API clients and the sign-in control), the
 * composer's model call, and the refusal unions that replaced four silent
 * failure paths. Accounts are the reason it could not be deferred — the stack
 * grid asks whether you are signed in in order to know WHICH stacks to draw, so
 * the store is on the first-paint path from the grid regardless of the nav
 * rail. That was measured rather than assumed: moving the rail's account block
 * behind `lazy()` was tried, and it put first paint UP by 0.3 KB, because the
 * chunk boundary cost more than the block saved while the store stayed where it
 * was.
 *
 * The 8 KB of headroom is deliberate and is the same margin the 2026-08-26
 * raise left. It exists so ordinary work does not trip this and real growth
 * does; a raise that lands exactly on the measurement makes the next one-line
 * change somebody else's build failure.
 */
const FIRST_PAINT_BUDGET_BYTES = 344 * KIBIBYTE

/** Matches the level a CDN compresses static assets at. */
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

/** Posix and Windows ids read the same, so the test below can be a plain substring. */
const asPosix = (moduleId: string): string => moduleId.replaceAll("\\", "/")

const isDependency = (moduleId: string): boolean =>
  asPosix(moduleId).includes("/node_modules/")

/**
 * A file in this repository — this app, `packages/ui`, the generated catalogue.
 * The absolute-path test is what excludes the bundler's own virtual modules
 * (`\0vite/preload-helper.js`, `rolldown/runtime.js`), which belong to neither
 * side and are a few hundred bytes wherever they land.
 */
const isFirstPartySource = (moduleId: string): boolean =>
  isAbsolute(moduleId) && !isDependency(moduleId)

/**
 * The entry and everything it reaches without an `import()` — the set the
 * browser must have before it can run anything.
 */
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
 * The editor's own screens change on every deploy; its dependencies change a
 * few times a year. Sharing a chunk throws that away — a one-line copy edit
 * re-hashes the file carrying React, the catalogue and every icon, and the
 * returning visitor downloads all of it again. This is the claim that the two
 * are kept apart, made against the modules that actually landed in each chunk
 * rather than against the config that was supposed to separate them, so a
 * grouping rule that stops matching says so.
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
