import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it, vi } from "vitest"

// Names any heavy module (corpus, Liquid, Shiki) the dialog drags onto first
// paint, transitively too; the build's budget reports only a number. Also pins
// that no `dangerouslySetInnerHTML` reaches the preview.

const DIALOG = "./output-preview-dialog"

// The cast types the empty array.
const trap = vi.hoisted(() => ({ reached: [] as string[] }))

// Hoisted: `vi.mock` arguments run above every `const`, so a plain helper would
// throw in its temporal dead zone.
const record = vi.hoisted(() => (name: string) => () => {
  trap.reached.push(name)
  return {}
})

// The lazily-imported modules, trapped by name too.
vi.mock("@/features/configure/lib/output-preview", record("lib/output-preview"))
vi.mock("@/features/configure/lib/render-tokens", record("lib/render-tokens"))

vi.mock("@workspace/compile/preview", record("@workspace/compile/preview"))
vi.mock("@workspace/compile/corpus", record("@workspace/compile/corpus"))
vi.mock(
  "@workspace/compile/config-source",
  record("@workspace/compile/config-source")
)
vi.mock("liquidjs", record("liquidjs"))
vi.mock("shiki/core", record("shiki/core"))
vi.mock("shiki/engine/javascript", record("shiki/engine/javascript"))

describe("the output preview dialog's static graph", () => {
  it("reaches neither the renderer, the corpus nor the highlighter", async () => {
    await import(DIALOG)

    expect(
      trap.reached,
      "the preview dialog pulls onto first paint something it is meant to reach through import()"
    ).toStrictEqual([])
  })
})

describe("the preview's rendering-safety decision", () => {
  // A browser can show the hatch unused, not absent. Named, not globbed: a glob
  // that stopped matching would pass.
  it.each([
    "./output-preview-dialog.tsx",
    "../lib/output-preview.ts",
    "../lib/render-tokens.ts",
  ])("does not reach for dangerouslySetInnerHTML in %s", (relative) => {
    const source = readFileSync(
      fileURLToPath(new URL(relative, import.meta.url)),
      "utf8"
    )

    expect(source).not.toContain("dangerouslySetInnerHTML")
    // `codeToHtml` returns markup, so using it means injecting it.
    expect(source).not.toContain("codeToHtml")
  })
})
