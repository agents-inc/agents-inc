/**
 * The whole package has to run in a browser, so nothing in it may reach a node
 * builtin.
 *
 * `@workspace/matrix` already holds this line and says so; this package is the
 * second one the editor consumes as source, and it is the one carrying the
 * renderers that used to sit beside `fs`, `path`, `os` and `url` calls. The
 * impure residue that could not follow them is named in the phase spec and
 * stayed in the CLI: reading an agent's files off disk, layering the Liquid
 * engine's roots over directories, and reading the CLI's own manifest for a
 * version.
 *
 * Every export the manifest declares is imported below rather than only the
 * barrel, because the barrel deliberately does not reach `./corpus` or
 * `./preview` and those two are exactly where a stray `path.join` would go
 * unnoticed. The trap catches a transitive reach as well as a direct one, which
 * a source scan could not: a builtin imported by something this package imports
 * is just as fatal in a browser and invisible in this package's own text.
 */

import { describe, expect, it, vi } from "vitest"

const trap = vi.hoisted(() => ({ reached: [] as string[] }))

/**
 * Hoisted, and it is the binding that actually needs it — `trap` does not.
 *
 * `record("node:fs")` is evaluated in the `vi.mock(...)` ARGUMENT LIST, and
 * vitest hoists those calls above every `const` in the file, so a plainly
 * declared `record` is dereferenced in its temporal dead zone and the module
 * throws before a single `it` is registered. `trap` is read only by the
 * innermost closure, which runs when a mocked module is imported and therefore
 * long after everything has initialised.
 *
 * The run is red either way. What the crash costs is the verification: the file
 * reports `(0 test)` and contributes nothing about its subject, so the only
 * mechanical check that this package is browser-safe becomes indistinguishable
 * from a merely broken test.
 */
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
// The bare spellings are separate specifiers and resolve past a `node:` mock,
// which is why both are trapped: `import path from "path"` is what the CLI's
// own modules use throughout, so it is the spelling a moved file arrives with.
vi.mock("fs", record("fs"))
vi.mock("fs/promises", record("fs/promises"))
vi.mock("path", record("path"))
vi.mock("os", record("os"))
vi.mock("url", record("url"))
vi.mock("crypto", record("crypto"))

/**
 * Every subpath `package.json` publishes, imported by literal specifier rather
 * than through a list. A loop over strings is invisible to the type-checker and
 * to the bundler alike, so an entry point that stops existing would read as a
 * runtime failure of this gate rather than as the missing module it is.
 */
async function importEveryPublishedEntryPoint(): Promise<void> {
  await import("./index")
  await import("./config-source")
  await import("./config-types-source")
  await import("./agent-source")
  await import("./engine")
  await import("./seed-to-config")
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
