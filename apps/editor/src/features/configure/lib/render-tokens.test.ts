import { afterEach, describe, expect, it, vi } from "vitest"

import {
  COMPUTED_AT_INSTALL,
  renderTokens,
  type PreviewToken,
} from "./render-tokens"

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

// The pane paints the placeholder itself, muted, so the grammar's token is cut
// around it and the cut-off runs keep the grammar's colour.
describe("the placeholder in a highlighted file", () => {
  const CODE = `  name: '${COMPUTED_AT_INSTALL}',\n} from '${COMPUTED_AT_INSTALL}/config-types'`

  const cutOf = (lines: readonly PreviewToken[][]) =>
    lines.map((line) =>
      line.map((token) => [token.content, token.placeholder === true])
    )

  it("is cut out of the token holding it, with no empty runs left beside it", async () => {
    expect(cutOf(await renderTokens(CODE, "typescript"))).toStrictEqual([
      [
        ["  name", false],
        [":", false],
        [" ", false],
        ["'", false],
        [COMPUTED_AT_INSTALL, true],
        ["'", false],
        [",", false],
      ],
      [
        ["} from ", false],
        ["'", false],
        [COMPUTED_AT_INSTALL, true],
        ["/config-types", false],
        ["'", false],
      ],
    ])
  })

  it("leaves the run after it in the string's own colour, and paints itself no colour", async () => {
    const tokens = (await renderTokens(CODE, "typescript")).flat()

    expect(
      tokens
        .find((token) => token.content === "/config-types")
        ?.color?.toLowerCase()
    ).toStrictEqual(BRAND_INK)
    expect(
      tokens
        .filter((token) => token.placeholder === true)
        .map((token) => token.color)
    ).toStrictEqual([undefined, undefined])
  })

  it("keeps what came before it in the same token ahead of it", async () => {
    expect(
      cutOf(
        await renderTokens(
          `// read from ${COMPUTED_AT_INSTALL} on install`,
          "typescript"
        )
      )
    ).toStrictEqual([
      [
        ["// read from ", false],
        [COMPUTED_AT_INSTALL, true],
        [" on install", false],
      ],
    ])
  })

  // A "text" body is third-party bytes, which no grammar runs over.
  it("is left inside a plain text body as it was written", async () => {
    const PLAIN_LINE = `x ${COMPUTED_AT_INSTALL} y`

    expect(await renderTokens(PLAIN_LINE, "text")).toStrictEqual([
      [{ content: PLAIN_LINE }],
    ])
  })
})

// Cached once loaded, so these load it afresh.
describe("loading the highlighter", () => {
  afterEach(() => {
    vi.doUnmock("shiki/core")
    vi.resetModules()
  })

  it("loads the ink-ramp theme and the markdown and yaml grammars", async () => {
    vi.resetModules()
    const { renderTokens: render } = await import("./render-tokens")

    const value = (await render(AGENT_MARKDOWN, "markdown"))
      .flat()
      .find((token) => token.content.includes("web-developer"))

    expect(value?.color?.toLowerCase()).toStrictEqual(BRAND_INK)
  })

  it("starts loading ahead of the first render when asked to", async () => {
    const created = vi.fn()
    vi.resetModules()
    vi.doMock("shiki/core", async (importOriginal) => {
      const actual = await importOriginal<typeof import("shiki/core")>()
      return {
        ...actual,
        createHighlighterCore: (
          ...options: Parameters<typeof actual.createHighlighterCore>
        ) => {
          created()
          return actual.createHighlighterCore(...options)
        },
      }
    })
    const { prefetchHighlighter } = await import("./render-tokens")

    prefetchHighlighter()

    await vi.waitFor(() => {
      expect(created).toHaveBeenCalledOnce()
    })
  })
})
