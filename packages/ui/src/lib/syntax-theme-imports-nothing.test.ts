// Reads its subject's text. React is a dependency here, so only this test stops an import that
// would break apps/www's React-free astro config. Anchored per line so prose cannot satisfy it.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

describe("inkRampSyntaxTheme", () => {
  describe("stays consumable by every surface that wants it", () => {
    it("declares no imports of its own", () => {
      const source = readFileSync(
        fileURLToPath(new URL("./syntax-theme.ts", import.meta.url)),
        "utf8"
      )

      expect(source).not.toMatch(/^\s*import\s/m)
    })
  })
})
