import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it, vi } from "vitest"

/**
 * TWO CLAIMS ABOUT THE PREVIEW DIALOG THAT NOTHING ELSE CAN MAKE, and neither
 * of them is about what it looks like — the rendered surface is covered in a
 * real browser by `e2e/specs/output-preview.spec.ts`.
 *
 * 1. WHAT IT DRAGS ONTO FIRST PAINT. The vendored agent corpus, the Liquid
 *    engine and Shiki are the three heaviest things this phase adds, and every
 *    one of them is only wanted behind a click. `scripts/first-paint-budget.ts`
 *    is the gate that catches them arriving, but it runs inside `vite build`
 *    and prints nothing on success, so the failure it reports is a number
 *    rather than a name. This file reports the name.
 *
 *    The trap is copied from `packages/compile/src/index.test.ts`, which holds
 *    the same line one workspace upstream and for the same reason: a grep of
 *    the component would answer the DIRECT case only, and the case nobody sees
 *    coming is transitive — a module the dialog legitimately imports acquires
 *    an import of the corpus, and nothing in the component changes.
 *
 * 2. WHAT IT DOES WITH A STRANGER'S BYTES. `skill-contents-dialog.tsx`'s
 *    rendering-safety decision is shipped and stays: no markdown renderer, no
 *    sanitiser, no `dangerouslySetInnerHTML`. Syntax highlighting is the one
 *    change that could have broken it — `codeToHtml` returns a string of HTML
 *    and there is exactly one way to put that on screen — and B4.3 records
 *    that `codeToTokens` was chosen so it did not have to.
 */

const DIALOG = "./output-preview-dialog"

const trap = vi.hoisted(() => ({ reached: [] as string[] }))

/**
 * Hoisted for the reason `packages/compile/src/node-free.test.ts` writes out at
 * length: `record(...)` is evaluated inside a `vi.mock` argument list, and
 * vitest hoists those above every `const` in the file, so a plainly declared
 * helper is dereferenced in its temporal dead zone and the module throws before
 * a single `it` is registered — which turns a red run into a file that reports
 * `(0 test)` and says nothing about its subject.
 */
const record = vi.hoisted(() => (name: string) => () => {
  trap.reached.push(name)
  return {}
})

// The two lazily-imported modules of this feature. Trapped by name as well as
// by their contents below, because they are where the weight is MEANT to live —
// a static import of either is the mistake, and it is the readable one.
vi.mock("@/features/configure/lib/output-preview", record("lib/output-preview"))
vi.mock("@/features/configure/lib/render-tokens", record("lib/render-tokens"))

// And the three heavy things themselves, so moving an import between the two
// modules above cannot smuggle one onto the static graph.
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
  /**
   * A source assertion rather than a behavioural one, and deliberately: the
   * OUTCOME — that a hostile file's characters reach the screen as text and
   * nothing runs — is asserted in the browser, where a sentinel on `window`
   * can say so. What a browser cannot say is that the escape hatch is absent
   * rather than merely unused on the path a spec happened to walk.
   *
   * The three files are named one by one instead of globbed. A glob that
   * stopped matching would report an empty list and pass, which is the failure
   * mode of every check that counts its own subjects.
   */
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
    // `codeToHtml` is the specific temptation B4.3 names: it returns a string
    // of markup, so reaching for it and putting it on screen are one decision.
    expect(source).not.toContain("codeToHtml")
  })
})
