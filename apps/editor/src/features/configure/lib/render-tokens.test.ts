import { describe, expect, it, vi } from "vitest"

import { renderTokens } from "./render-tokens"

/**
 * The seam B4.3 defines, and the reason B3 and B4 could land in either order:
 * `renderTokens` answers plain `{ content, color }` objects that render as
 * ordinary React children, so the content pane never learns what a highlighter
 * is.
 *
 * THAT SHAPE IS THE SECOND REASON SHIKI WON. `skill-contents-dialog.tsx`'s
 * shipped rendering-safety decision — no markdown renderer, no sanitiser, no
 * `dangerouslySetInnerHTML` — has to survive a dialog that colours code, and
 * every HTML-emitting alternative breaks it, `codeToHtml` included. The
 * absence of that escape hatch on this path is asserted in
 * `components/output-preview-dialog.test.ts`; what is asserted here is the
 * other half, that the tokens carry the file's own bytes and nothing else.
 */

// The literal colour the ink ramp paints a string or a number, quoted from the
// design's palette rather than imported from `@workspace/ui/lib/syntax-theme`.
// An assertion that reads the very value the product renders cannot fail, which
// is why `e2e/pages` mirrors the product's copy instead of importing it.
const BRAND_INK = "#a06a1c"

const TYPESCRIPT = `export const answer = 42;\n`

// A compiled sub-agent, in miniature: YAML frontmatter, then markdown. The
// markdown grammar's first pattern is `#frontMatter`, which embeds
// `source.yaml` — so this is the one input that says whether the yaml grammar
// was loaded.
const AGENT_MARKDOWN = `---
name: web-developer
model: opus
---

# Web developer
`

const textOf = (lines: readonly { content: string }[][]): string =>
  lines.map((line) => line.map((token) => token.content).join("")).join("\n")

describe("renderTokens", () => {
  /**
   * The claim that matters more than any colour: highlighting is a colouring of
   * the file, never an edit to it. A grammar that swallowed a character, a
   * trailing newline dropped on the way through, or a tab expanded to spaces
   * would each make the pane disagree with the file the CLI writes — which is
   * the one thing this dialog exists to rule out.
   */
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

  /**
   * B4.2's own stated verification, written as it is written there: "render a
   * compiled agent and assert the `name:` VALUE in the frontmatter carries the
   * literal token colour rather than the default. If it does so without `yaml`
   * loaded, drop it and shrink the payload."
   *
   * So this spec is not only a colour check — it is the evidence for shipping a
   * third grammar at all, and it fails in the direction that says "delete
   * something" as readily as in the one that says "fix something".
   */
  it("colours a frontmatter value as a literal, which is what the yaml grammar buys", async () => {
    const lines = await renderTokens(AGENT_MARKDOWN, "markdown")
    const value = lines
      .flat()
      .find((token) => token.content.includes("web-developer"))

    expect(value, "no token carried the frontmatter value at all").toBeDefined()
    // Lowercased because a hex is a value rather than a string the product
    // renders, and highlighters differ on the case they echo it back in.
    expect(value?.color?.toLowerCase()).toStrictEqual(BRAND_INK)
  })

  /**
   * Third-party bytes are plain text BY DECISION — §2's scope fence and B3.3
   * both say so, and `skill-contents-dialog.tsx`'s rendering-safety note is the
   * ruling they follow. `"text"` is how the content pane asks for that, and it
   * has to mean uncoloured rather than "highlighted as something harmless": a
   * grammar quietly applied to a stranger's file is a grammar running over a
   * stranger's file.
   */
  it("leaves plain text uncoloured", async () => {
    const HOSTILE = `<img src=x onerror=alert(1)>\n`
    const lines = await renderTokens(HOSTILE, "text")

    expect(textOf(lines)).toStrictEqual(HOSTILE)
    expect(lines.flat().map((token) => token.color)).toStrictEqual(
      lines.flat().map(() => undefined)
    )
  })

  /**
   * B4.3 requires this in as many words: "a Shiki failure degrades to readable
   * plain text rather than an empty pane, which the error path must assert."
   *
   * The failure is real rather than simulated at the seam — the highlighter's
   * own module is what throws — because the shapes that actually happen are a
   * chunk that fails to load and a grammar that will not parse, and both arrive
   * from inside that import. A pane that empties on either would tell a reader
   * the file is empty, which is a lie about what the CLI writes.
   */
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
