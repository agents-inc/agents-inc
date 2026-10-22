import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

describe("the preview's rendering-safety decision", () => {
  // A browser can show the hatch unused, not absent. Named, not globbed: a glob
  // that stopped matching would pass.
  it.each([
    "./output-preview-dialog.tsx",
    "../lib/output-preview.ts",
    "../lib/render-tokens.ts",
  ])("does not reach for dangerouslySetInnerHTML in %s", (relative) => {
    const source = readFileSync(
      fileURLToPath(new URL(relative, import.meta.url)),
      "utf8"
    )

    expect(source).not.toContain("dangerouslySetInnerHTML")
    // `codeToHtml` returns markup, so using it means injecting it.
    expect(source).not.toContain("codeToHtml")
  })
})
