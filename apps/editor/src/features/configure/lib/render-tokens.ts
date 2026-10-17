import { inkRampSyntaxTheme } from "@workspace/ui/lib/syntax-theme"

import type { HighlighterCore } from "shiki/core"

// Tokens, never markup: untrusted bytes reach the screen as text only. The
// highlighter loads lazily, off the first-paint path, and failure degrades to
// plain text.

// `placeholder` marks the run the pane paints itself, not from the grammar.
export type PreviewToken = {
  content: string
  color?: string
  placeholder?: true
}

// Painted muted rather than as a string literal, which no theme can express.
// Declared here, not beside the model: the first-paint pane cannot import it.
export const COMPUTED_AT_INSTALL = "<computed at install time>"

// `"text"` is third-party content: nothing is run over it.
export type PreviewLang = "typescript" | "markdown" | "text"

const PLAIN: PreviewLang = "text"

const THEME_NAME = "ink-ramp"

const asPlainLines = (code: string): PreviewToken[][] =>
  code.split("\n").map((line) => [{ content: line }])

// `yaml`: the markdown grammar embeds it for frontmatter.
async function loadHighlighter(): Promise<HighlighterCore> {
  const [core, engine, typescript, markdown, yaml] = await Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("@shikijs/langs/typescript"),
    import("@shikijs/langs/markdown"),
    import("@shikijs/langs/yaml"),
  ])

  return core.createHighlighterCore({
    themes: [inkRampSyntaxTheme(THEME_NAME, "light")],
    langs: [typescript.default, markdown.default, yaml.default],
    // Wasm-free, so the bundle ships no extra asset.
    engine: engine.createJavaScriptRegexEngine(),
  })
}

// Dropped on failure, so one bad network moment is not permanent.
let pending: Promise<HighlighterCore> | undefined

const highlighter = (): Promise<HighlighterCore> =>
  (pending ??= loadHighlighter().catch((error: unknown) => {
    pending = undefined
    throw error
  }))

export const prefetchHighlighter = (): void => {
  void highlighter().catch(() => {
    // `renderTokens` handles the failure by degrading to text.
  })
}

// One entry per line; the concatenated contents are the input exactly.
export async function renderTokens(
  code: string,
  lang: PreviewLang
): Promise<PreviewToken[][]> {
  if (lang === PLAIN) return asPlainLines(code)

  try {
    const { tokens } = (await highlighter()).codeToTokens(code, {
      lang,
      theme: THEME_NAME,
    })
    return tokens.map(markPlaceholders)
  } catch {
    return asPlainLines(code)
  }
}

// Only grammar output is re-cut; `"text"` bodies are never touched.
const markPlaceholders = (line: readonly PreviewToken[]): PreviewToken[] =>
  line.flatMap((token) =>
    token.content.includes(COMPUTED_AT_INSTALL)
      ? cutPlaceholder(token)
      : [token]
  )

const cutPlaceholder = (token: PreviewToken): PreviewToken[] => {
  // Every run after the first follows one placeholder; empty runs are dropped.
  const keepingItsColour = (run: string): PreviewToken[] =>
    run === "" ? [] : [{ ...token, content: run }]

  return token.content
    .split(COMPUTED_AT_INSTALL)
    .flatMap((run, index): PreviewToken[] =>
      index === 0
        ? keepingItsColour(run)
        : [
            { content: COMPUTED_AT_INSTALL, placeholder: true },
            ...keepingItsColour(run),
          ]
    )
}
