/**
 * The package runs in a browser, so nothing in it may reach a node builtin. Every published subpath
 * is imported, since the barrel skips `./corpus` and `./preview`; the trap also catches transitive
 * reaches a source scan could not.
 */

import { describe, expect, it, vi } from "vitest"

const trap = vi.hoisted(() => ({ reached: [] as string[] }))

// Hoisted: `record` is called in `vi.mock` arguments, which vitest hoists above every `const`.
const record = vi.hoisted(() => (name: string) => () => {
  trap.reached.push(name)
  return {}
})

vi.mock("node:fs", record("node:fs"))
vi.mock("node:fs/promises", record("node:fs/promises"))
vi.mock("node:path", record("node:path"))
vi.mock("node:os", record("node:os"))
vi.mock("node:url", record("node:url"))
vi.mock("node:crypto", record("node:crypto"))
vi.mock("node:process", record("node:process"))
// Bare specifiers resolve past a `node:` mock, and the CLI's modules use them.
vi.mock("fs", record("fs"))
vi.mock("fs/promises", record("fs/promises"))
vi.mock("path", record("path"))
vi.mock("os", record("os"))
vi.mock("url", record("url"))
vi.mock("crypto", record("crypto"))

// Literal specifiers, so a missing entry point is a type error rather than a runtime failure.
async function importEveryPublishedEntryPoint(): Promise<void> {
  await import("./index")
  await import("./config-source")
  await import("./config-types-source")
  await import("./agent-source")
  await import("./engine")
  await import("./seed-to-config")
  await import("./global-config")
  await import("./carried-skill")
  await import("./generated/corpus")
  await import("./preview")
}

describe("every module this package publishes", () => {
  it("runs without a node builtin", async () => {
    await importEveryPublishedEntryPoint()

    expect(
      trap.reached,
      "a node builtin anywhere in this package is a browser failure at import time"
    ).toStrictEqual([])
  })
})
