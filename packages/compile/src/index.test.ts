// The barrel must not reach `./corpus` or `./preview`, even transitively, or the editor's first
// paint pays for them.

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
