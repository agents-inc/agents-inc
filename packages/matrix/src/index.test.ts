import { describe, expect, it } from "vitest"

import { CODEX_MODEL_NAMES, EFFORT_NAMES, MODEL_NAMES } from "./index"

/**
 * Re-derive with `HOME=$(mktemp -d) CODEX_HOME=$(mktemp -d) node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex debug models --bundled`.
 * `gpt-5.5` is left out: it refuses `max` and has no spawn tool.
 */
const OFFERED_CODEX_MODELS = [
  "gpt-6-astra",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
] as const

describe("the Codex models the barrel exports", () => {
  it("are the four offered ids, in the order a picker lists them", () => {
    expect([...CODEX_MODEL_NAMES]).toStrictEqual([...OFFERED_CODEX_MODELS])
  })

  it("share no member with the Claude selectors, so neither can stand in for the other", () => {
    const claude = new Set<string>(MODEL_NAMES)

    expect(CODEX_MODEL_NAMES.filter((id) => claude.has(id))).toStrictEqual([])
  })

  it("leave the effort vocabulary as it was", () => {
    expect([...EFFORT_NAMES]).toStrictEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])
  })
})
