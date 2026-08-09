import { describe, expect, it } from "vitest"

import { DEFAULT_SELECTION_OPTIONS } from "./selection-defaults"

// The one answer to "what does an untouched pick do?". Both surfaces spell
// their fresh-pick defaults from this object — the editor's fresh skill entry
// and resting agent scope, and the CLI's seed decode — so a wrong value here
// is the wrong value everywhere at once. These pin the words: a fresh pick
// installs as a plugin, into the user's own ~/.claude.
describe("DEFAULT_SELECTION_OPTIONS", () => {
  it("installs a fresh pick as a plugin, into the global scope", () => {
    expect(DEFAULT_SELECTION_OPTIONS).toStrictEqual({
      install: "plugin",
      scope: "global",
    })
  })
})
