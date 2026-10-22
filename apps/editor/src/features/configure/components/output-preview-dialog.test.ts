import { describe, expect, it, vi } from "vitest"

// Names any heavy module (corpus, Liquid, Shiki) the dialog drags onto first
// paint, transitively too; the build's budget reports only a number. The
// editor's own modules are not trapped, only what they drag in.

const DIALOG = "./output-preview-dialog"

// The cast types the empty array.
const trap = vi.hoisted(() => ({ reached: [] as string[] }))

// Hoisted: `vi.mock` arguments run above every `const`, so a plain helper would
// throw in its temporal dead zone.
const record = vi.hoisted(() => (name: string) => () => {
  trap.reached.push(name)
  return {}
})

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
