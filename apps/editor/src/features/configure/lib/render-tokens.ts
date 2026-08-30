import { inkRampSyntaxTheme } from "@workspace/ui/lib/syntax-theme"

import type { HighlighterCore } from "shiki/core"

/**
 * The seam between the content pane and the highlighter.
 *
 * It answers plain `{ content, color }` objects, which is the whole reason
 * Shiki was chosen over anything that emits markup: `skill-contents-dialog.tsx`
 * decided once that untrusted bytes reach the screen as text — no markdown
 * renderer, no sanitiser, and no raw-HTML escape hatch anywhere on the path —
 * and a pane that colours code has to keep that decision. Every markup-
 * returning API breaks it, because there is exactly one way to put a string of
 * markup on screen. The absence of both names is asserted, on this file by
 * name, in `components/output-preview-dialog.test.ts`.
 *
 * Everything heavy sits behind the `import()` below rather than at module
 * scope, so a module the dialog reaches for statically cannot drag the
 * highlighter onto the first-paint path — and a chunk that fails to load
 * degrades to readable text rather than an empty pane, which would be a lie
 * about what the CLI writes.
 */

/**
 * One coloured run of a line. `color` absent means the ramp said nothing about
 * it; `placeholder` marks the one run the pane paints from the design rather
 * than from the grammar — see {@link COMPUTED_AT_INSTALL}.
 */
export type PreviewToken = {
  content: string
  color?: string
  placeholder?: true
}

/**
 * The string the model writes wherever the install's own machine decides the
 * value, and the reason this module knows about it at all.
 *
 * It reaches the pane inside a TypeScript string literal, so the ink ramp paints
 * it `brand-ink` — the colour that means "a chosen value, the part of an example
 * a reader substitutes". A placeholder is the opposite of a chosen value, so
 * §B3.5 rule 2 asks for it in the muted punctuation colour instead. That is a
 * decision about a run of text rather than about a scope, which no TextMate
 * theme can express: the run is split out of its token here and marked, and the
 * pane paints a marked run itself.
 *
 * IT IS DECLARED HERE RATHER THAN BESIDE THE MODEL THAT WRITES IT, and the
 * reason is structural rather than aesthetic: the pane cannot import the model.
 * `output-preview-dialog.tsx` is on the first-paint path and its own spec fails
 * a static import of `lib/output-preview` by name, so the shared string has to
 * live in the lighter of the two modules. `output-preview.ts` imports it from
 * here, which is the direction that costs nothing — everything heavy in this
 * module is behind the `import()` in {@link loadHighlighter}.
 */
export const COMPUTED_AT_INSTALL = "<computed at install time>"

/**
 * The three grammars this dialog has a subject for, plus the one word that asks
 * for no grammar at all.
 *
 * `"text"` is how the pane says "these are somebody else's bytes": the scope
 * fence rules third-party content out of the grammars entirely, so a stranger's
 * file is split into lines and nothing is run over it.
 */
export type PreviewLang = "typescript" | "markdown" | "text"

const PLAIN: PreviewLang = "text"

/**
 * The theme's name is its handle inside the highlighter and appears nowhere on
 * screen; `light` is the only mode this app has.
 */
const THEME_NAME = "ink-ramp"

/** The file as its own lines, uncoloured — the plain-text answer and the failure answer alike. */
const asPlainLines = (code: string): PreviewToken[][] =>
  code.split("\n").map((line) => [{ content: line }])

/**
 * `yaml` is here for one reason and it is asserted rather than assumed: the
 * markdown grammar's first pattern is `#frontMatter`, which embeds
 * `source.yaml`, so a compiled sub-agent's frontmatter falls back to plain text
 * without it.
 */
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
    // The wasm-free engine, so the browser bundle ships no asset beside itself.
    engine: engine.createJavaScriptRegexEngine(),
  })
}

/**
 * One highlighter per session, and the cache is dropped on failure rather than
 * held: a chunk that failed to load once is worth asking for again, and a
 * rejected promise kept here would make one bad network moment permanent.
 */
let pending: Promise<HighlighterCore> | undefined

const highlighter = (): Promise<HighlighterCore> =>
  (pending ??= loadHighlighter().catch((error: unknown) => {
    pending = undefined
    throw error
  }))

/**
 * Build the highlighter before anything needs colouring.
 *
 * Importing this module alone buys almost nothing: the grammars and the engine
 * are behind {@link loadHighlighter}, and constructing the highlighter is the
 * slow half. Warming it while the page is idle is what makes the first file the
 * preview opens arrive coloured rather than repainting a beat later.
 */
export const prefetchHighlighter = (): void => {
  void highlighter().catch(() => {
    // A warm-up has nobody to tell. The failure is answered where it matters,
    // by `renderTokens` degrading to readable text.
  })
}

/**
 * The file's own bytes, coloured — one entry per line, and the concatenated
 * token contents are the input exactly.
 *
 * That last part is the claim that matters more than any colour: highlighting
 * is a colouring of the file and never an edit to it, so a swallowed character
 * or a dropped trailing newline would make the pane disagree with the file the
 * CLI writes.
 */
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

/**
 * The placeholder runs of one line, cut out of whatever tokens the grammar
 * produced.
 *
 * Only the grammar's own answer is re-cut. A `"text"` body is a stranger's file
 * and the rule there is that nothing runs over it at all, so a stranger who
 * happens to have typed this string keeps the treatment every other byte of
 * theirs gets.
 */
const markPlaceholders = (line: readonly PreviewToken[]): PreviewToken[] =>
  line.flatMap((token) =>
    token.content.includes(COMPUTED_AT_INSTALL)
      ? cutPlaceholder(token)
      : [token]
  )

/**
 * One token split around every occurrence of the placeholder, keeping the
 * grammar's colour on the parts that are not it.
 *
 * The concatenated contents are the token's own, which is the claim
 * {@link renderTokens} makes about the whole file: this cuts a run out and
 * recolours it, and never edits a byte.
 */
const cutPlaceholder = (token: PreviewToken): PreviewToken[] => {
  // A split drops the separator, so every run except the first is preceded by
  // one occurrence of it — and an empty run is a placeholder against an edge or
  // against another placeholder, which is a token with nothing in it.
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
