// Pins that each provider's folder segment is the provider's own value.

import { describe, expect, it } from "vitest"

import { SOURCE_ROOT_DIR } from "./paths.js"
import { PROVIDERS, sourceDirName, type Provider } from "./source-layout.js"

const EVERY_PROVIDER = ["claude", "codex"] as const

// Stated, not derived: derived, it would agree with a wrong join order.
const SOURCE_DIR_NAMES = {
  claude: ".agents-inc/claude",
  codex: ".agents-inc/codex",
} as const satisfies Record<Provider, string>

// The whole export roster, so a default provider cannot creep back; an absence a rename satisfies.
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
