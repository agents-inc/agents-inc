/**
 * What the root barrel is allowed to drag in.
 *
 * Two of this package's modules are heavy and only one consumer wants either:
 * `./corpus` is the vendored agent tree, the largest artefact this phase adds,
 * and `./preview` is the only module that pulls both it and `liquidjs`. The
 * editor reaches them through `import()` so they land in a lazy chunk; a barrel
 * that reaches either — directly or through anything it imports — puts them on
 * whatever imports the barrel, and the editor's first-paint budget is what pays.
 *
 * A grep of `index.ts` would answer the direct case only. The trap below covers
 * the transitive one, which is the one nobody sees coming: a module the barrel
 * legitimately exports acquires an import of the corpus, and nothing in
 * `index.ts` changes.
 */

import { describe, expect, it, vi } from "vitest"

const trap = vi.hoisted(() => ({ reached: [] as string[] }))

vi.mock("liquidjs", () => {
  trap.reached.push("liquidjs")
  return {}
})

vi.mock("./generated/corpus", () => {
  trap.reached.push("./corpus")
  return {}
})

vi.mock("./preview", () => {
  trap.reached.push("./preview")
  return {}
})

describe("the root barrel", () => {
  it("reaches neither the vendored corpus nor the template engine", async () => {
    await import("./index")

    expect(
      trap.reached,
      "importing @workspace/compile must not pull in anything the editor reaches through import()"
    ).toStrictEqual([])
  })
})
