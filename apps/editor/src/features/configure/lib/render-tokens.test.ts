import { describe, expect, it, vi } from "vitest"

import { renderTokens } from "./render-tokens"

// Tokens are plain `{ content, color }` objects rendered as React children, so
// no HTML is ever injected; they must carry the file's bytes and nothing else.

// Quoted, not imported from `syntax-theme`, so the assertion can fail.
const BRAND_INK = "#a06a1c"

const TYPESCRIPT = `export const answer = 42;\n`

// Markdown's `#frontMatter` embeds `source.yaml`, so this shows whether the
// yaml grammar loaded.
const AGENT_MARKDOWN = `---
name: web-developer
model: opus
---

# Web developer
`

const textOf = (lines: readonly { content: string }[][]): string =>
  lines.map((line) => line.map((token) => token.content).join("")).join("\n")

describe("renderTokens", () => {
  // Highlighting colours the file, never edits it.
  it.each(["typescript", "markdown", "text"] as const)(
    "returns the input's own bytes for %s and nothing else",
    async (lang) => {
      const code = lang === "markdown" ? AGENT_MARKDOWN : TYPESCRIPT

      expect(textOf(await renderTokens(code, lang))).toStrictEqual(code)
    }
  )

  it("gives one line of tokens per line of input", async () => {
    const lines = await renderTokens(AGENT_MARKDOWN, "markdown")

    expect(lines).toHaveLength(AGENT_MARKDOWN.split("\n").length)
  })

  // Also the evidence for shipping the yaml grammar at all.
  it("colours a frontmatter value as a literal, which is what the yaml grammar buys", async () => {
    const lines = await renderTokens(AGENT_MARKDOWN, "markdown")
    const value = lines
      .flat()
      .find((token) => token.content.includes("web-developer"))

    expect(value, "no token carried the frontmatter value at all").toBeDefined()
    // Highlighters differ on the hex case they echo back.
    expect(value?.color?.toLowerCase()).toStrictEqual(BRAND_INK)
  })

  // Third-party bytes stay plain: `"text"` must mean no grammar runs at all.
  it("leaves plain text uncoloured", async () => {
    const HOSTILE = `<img src=x onerror=alert(1)>\n`
    const lines = await renderTokens(HOSTILE, "text")

    expect(textOf(lines)).toStrictEqual(HOSTILE)
    expect(lines.flat().map((token) => token.color)).toStrictEqual(
      lines.flat().map(() => undefined)
    )
  })

  // The highlighter's own module throws, as a failed chunk or grammar would.
  it("falls back to readable text when the highlighter cannot load", async () => {
    vi.resetModules()
    vi.doMock("shiki/core", () => {
      throw new Error("chunk failed to load")
    })

    const { renderTokens: render } = await import("./render-tokens")
    const lines = await render(TYPESCRIPT, "typescript")

    expect(textOf(lines)).toStrictEqual(TYPESCRIPT)

    vi.doUnmock("shiki/core")
    vi.resetModules()
  })
})
