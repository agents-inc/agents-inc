// Pins that each provider's folder segment is the provider's own value.

import { describe, expect, expectTypeOf, it } from "vitest"

import { SOURCE_ROOT_DIR } from "./paths.js"
import { PROVIDERS, sourceDirName, type Provider } from "./source-layout.js"

const EVERY_PROVIDER = ["claude", "codex"] as const

// Stated, not derived: derived, it would agree with a wrong join order.
const SOURCE_DIR_NAMES = {
  claude: ".agents-inc/claude",
  codex: ".agents-inc/codex",
} as const satisfies Record<Provider, string>

describe("the providers a source folder can belong to", () => {
  it("is exactly claude and codex", () => {
    expect(PROVIDERS).toStrictEqual(EVERY_PROVIDER)
  })

  // By value, not by name: an absence asserted by name passes once the default is renamed.
  it("hands out no provider a caller can leave unsaid", async () => {
    const published = await import("./index.js")
    const providers: readonly unknown[] = PROVIDERS

    expect(
      Object.entries(published)
        .filter(([, value]) => providers.includes(value))
        .map(([name]) => name),
      "the package exports a lone provider, so a path builder that never asks which installation it is about still compiles"
    ).toStrictEqual([])
    expectTypeOf(sourceDirName).parameters.toEqualTypeOf<[Provider]>()
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
