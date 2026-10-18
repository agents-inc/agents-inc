import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The console is the sink a development build reports through until a vendor
// is seated, so each spec loads the module fresh.
const freshReport = async () => {
  vi.resetModules()
  return import("./report")
}

describe("the development build's console sink", () => {
  const warned = vi.fn()
  const errored = vi.fn()

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(warned)
    vi.spyOn(console, "error").mockImplementation(errored)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("warns an issue under an [issue] tag, with its context", async () => {
    const { reportIssue } = await freshReport()

    reportIssue("Skill tree listing failed", { status: 403 })

    expect(warned.mock.calls).toStrictEqual([
      ["[issue] Skill tree listing failed", { status: 403 }],
    ])
  })

  it("warns an issue with no context beside an empty one", async () => {
    const { reportIssue } = await freshReport()

    reportIssue("Skill tree listing was unreadable")

    expect(warned.mock.calls).toStrictEqual([
      ["[issue] Skill tree listing was unreadable", {}],
    ])
  })

  it("logs an error with its context, and an empty one when it has none", async () => {
    const { reportError } = await freshReport()
    const failure = new Error("render failed")

    reportError(failure, { route: "/" })
    reportError(failure)

    expect(errored.mock.calls).toStrictEqual([
      [failure, { route: "/" }],
      [failure, {}],
    ])
  })
})
