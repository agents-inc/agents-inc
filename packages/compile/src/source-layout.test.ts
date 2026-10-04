/**
 * The source folder's RELATIVE names, which is the whole of what this package
 * may hold about it.
 *
 * The source folder is `.agents-inc/<provider>/`, and one installation is
 * exactly one provider — the FOLDER is what says which, and nothing inside
 * `config.ts` records it. So the folder segment is the provider's own value, and
 * that equality is the thing this file pins: a table read the other way round
 * would let the two drift and nothing would notice.
 *
 * Names only, no machine. `paths.ts` and `install-layout.ts` follow the same
 * split — a browser holds the vocabulary, the CLI holds the `path.join` — which
 * is why `sourceDirName` answers a POSIX string rather than a joined path.
 */

import { describe, expect, it } from "vitest"

import { SOURCE_ROOT_DIR } from "./paths.js"
import { PROVIDERS, sourceDirName, type Provider } from "./source-layout.js"

/** Every provider the roster may name, as a roster rather than a count. */
const EVERY_PROVIDER = ["claude", "codex"] as const

/**
 * The folder each provider's source lives in, stated rather than derived.
 *
 * Derived, this table would be `sourceDirName` restated — it would agree with a
 * function that joined the segments in the wrong order just as readily.
 */
const SOURCE_DIR_NAMES = {
  claude: ".agents-inc/claude",
  codex: ".agents-inc/codex",
} as const satisfies Record<Provider, string>

/**
 * Everything this module hands out once no caller may leave the provider unsaid.
 *
 * The step that threaded a provider through every path stated its own proof as a deletion:
 * `DEFAULT_PROVIDER` was the one place the product hard-coded a provider, every path
 * builder that defaulted reached it, and removing it turned "which call sites still
 * assume Claude" from a census that goes stale into a compiler error apiece. A
 * constant that had survived the step would have left a default for the next path
 * builder to take, and the census would have to be run again by hand.
 *
 * Stated as the whole roster rather than as an absence: an absence is satisfied by a
 * rename, and a roster says what the module IS. Types are not in it — they are erased
 * before anything can look.
 */
const EVERY_EXPORT = ["PROVIDERS", "sourceDirName"] as const

describe("the providers a source folder can belong to", () => {
  it("is exactly the two the rename introduces", () => {
    expect(PROVIDERS).toStrictEqual(EVERY_PROVIDER)
  })

  it("hands out no provider a caller can leave unsaid", async () => {
    const sourceLayout = await import("./source-layout.js")

    expect(
      Object.keys(sourceLayout).sort(),
      "a default provider is still exported, so a path builder that never asks which installation it is about still compiles"
    ).toStrictEqual([...EVERY_EXPORT].sort())
  })
})

describe("the names a source folder is written with", () => {
  it("roots every provider's folder under one parent", () => {
    expect(SOURCE_ROOT_DIR).toBe(".agents-inc")
  })
})

describe("sourceDirName", () => {
  it("answers the folder every provider's source lives in", () => {
    expect(
      Object.fromEntries(
        PROVIDERS.map((provider) => [provider, sourceDirName(provider)])
      )
    ).toStrictEqual(SOURCE_DIR_NAMES)
  })

  it("puts every provider's folder under the root, with the provider as the segment", () => {
    expect(PROVIDERS.map((provider) => sourceDirName(provider))).toStrictEqual(
      PROVIDERS.map((provider) => `${SOURCE_ROOT_DIR}/${provider}`)
    )
  })

  it("separates the segments the way a manifest and a browser both read", () => {
    expect(
      PROVIDERS.filter((provider) => sourceDirName(provider).includes("\\")),
      "a platform separator reached a name this package publishes — nothing here may read the machine"
    ).toStrictEqual([])
  })
})
