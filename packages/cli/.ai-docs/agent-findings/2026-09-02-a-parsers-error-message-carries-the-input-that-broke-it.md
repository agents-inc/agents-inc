---
type: missing-standard
severity: high
affected_files:
  - src/cli/utils/string.ts
  - src/cli/utils/errors.ts
  - src/cli/lib/schema-validator.ts
  - src/cli/lib/seed/read-piped-payload.ts
  - src/cli/lib/seed/publish-seed.ts
  - src/cli/lib/seed/fetch-seed.ts
  - src/cli/lib/matrix/matrix-resolver.ts
  - src/cli/commands/search.ts
  - src/cli/lib/plugins/plugin-validator.ts
  - src/cli/lib/skills/skill-metadata.ts
  - src/cli/lib/loading/loader.ts
  - src/cli/lib/matrix/matrix-loader.ts
  - src/cli/lib/plugins/plugin-settings.ts
  - src/cli/commands/build/marketplace.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-09-02
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  The sanitiser exists and the renderers that funnel foreign text are closed — truncateText,
  formatZodIssue, getErrorMessage, and the seed, search and matrix-resolver sites. What is NOT
  closed is the wizard's own Ink rendering of catalogue metadata: source-grid.tsx, category-grid.tsx,
  checkbox-grid.tsx, step-agents.tsx, stack-selection.tsx and edit.tsx all interpolate a marketplace
  author's displayName or description straight into a Text node. Those need one decision this lane
  did not have standing to take — whether the matrix is sanitised once when it is seated
  (initializeMatrix in matrix/matrix-provider.ts, which also feeds seatCatalog and therefore the
  compiled agent bodies), or whether each render site sanitises. The first closes the class and
  changes bytes in written artefacts for a hostile catalogue only; the second is a patch per site
  over 499 displayName occurrences in 19 files.
---

# A parser's error message carries the input that broke it

## What was found

The CLI printed remote HTTP bodies, piped stdin and third-party catalogue metadata into the
terminal with no control-character stripping, and no sanitiser existed anywhere in the package —
`grep -rn 'x1b\|stripAnsi\|\\u001b' packages/cli/src/cli` returned exactly one file, `utils/terminal.ts`,
which WRITES escapes. A 503 body carrying `ESC[2K` and a carriage return repainted the line the CLI
had printed in its own voice, forging a sentence attributed to the CLI.

That much was the filed row. Two things about it were wrong in the same direction, and both matter
more than the defect.

## The census was keyed on the wrong thing

The row named five print sites. Keying a census on **where text is printed** finds print sites; the
class is defined by **which renderer the text funnels through**, and the two real chokepoints were
in no version of the row:

- **`truncateText` in `utils/string.ts`.** Every one of its five call sites is text the CLI did not
  author — a refusal off the wire, an excerpt of stdin, a rule author's `reason`, a catalogue
  description. It was already, in fact, the "bound foreign text" function; nobody had noticed,
  so nothing was written down about what that made it responsible for.
- **`formatZodIssue` in `lib/schema-validator.ts`.** Around twenty call sites, and its own docblock
  says it is "one place for the path-prefixed issue rendering shared by every Zod reporter". Every
  part of the sentence it builds comes from the **refused document** rather than from the schema: a
  path segment and an unrecognised key are object keys the document chose, and a message quotes the
  value received. The documents reaching it are a stranger's `SKILL.md` frontmatter, their
  `metadata.yaml`, their marketplace manifest and whatever arrived on stdin.

A five-file patch built from the row as filed would have left both open, and would have looked
complete.

## The sharp half: provenance follows the input, not the object

The defect that survived a first implementation, and was caught only because a spec asserted on the
whole rendered message rather than on the fragment it was about:

```
What arrived on standard input is not JSON: Unexpected token 'h', "here is<ESC>[2"... is not valid
JSON. It began: here is my config › PAYLOAD ACCEPTED
```

The excerpt was sanitised. The **reason** was not — because the reason is an `Error` message
produced by V8, and an `Error` from Node looks like the CLI's own text. It is not. A parser writes
the input that broke it into the message it throws, so the message inherits the provenance of the
bytes rather than of the object. `JSON.parse` quotes the offending input verbatim; YAML parsers
quote the offending line; a `ZodError`'s `message` is a JSON document of issues carrying received
values.

The generalisation is the finding: **"this string was produced by trusted code" is not an argument
that the string is trusted.** Ask where the bytes came from, not where the object came from.

The class, and it is well defined — a catch block reporting a parse failure of bytes the CLI did
not author:

```
grep -rn -A4 -E '(JSON\.parse|parseYaml)\(' packages/cli/src/cli --include='*.ts' | grep -E 'getErrorMessage|read\.reason|\.message'
```

Eight sites at the time of writing. All eight are closed by sanitising in `getErrorMessage`
(`utils/errors.ts`) rather than at any of them, which is the same argument as `formatZodIssue`: its
docblock already said it extracts a "human-readable message", so every caller is on its way to a
terminal and this is the last point at which the text is a value rather than output. Sanitising
there covers 74 call sites and every future one; the full unit suite passed unchanged across all of
them, which is the evidence that it is a no-op for honest text.

## What nothing would have caught

Nothing mechanical reaches any of this. A raw interpolation of a foreign string type-checks, lints
and passes; `no-control-regex` fires only on code that _matches_ control characters, never on code
that _prints_ them. There is no test that can fail for a site nobody has written a spec for, and the
absence is invisible from every site — which is why the sanitiser was placed at three shared
renderers rather than at the sites, and why the `eslint-disable no-control-regex` on the sanitiser
was deliberately left INLINE rather than moved into `eslint.config.js`: an override would permit
control-character regexes package-wide, and the next one should still be reported.

## Proposed standard

1. **Text the CLI did not author is made inert where it enters a renderer, not where it is printed.**
   The renderers are `truncateText`, `formatZodIssue` and `getErrorMessage`; a fourth should be
   added to that list rather than sanitising at a call site.
2. **Strip before you truncate.** A cut taken first can land inside an escape sequence, and the
   fragment left behind is worse than the whole sequence: a terminal holds it open and reads the
   ellipsis and whatever is printed next as its missing parameters. Reproduced — `truncateText`
   returned `'abcd<ESC>…'` before the order was fixed. Stripping first also decides what the budget
   buys, since escape bytes are invisible.
3. **Newline and tab survive; everything else in C0, C1, DEL and every escape sequence does not.**
   Getting this wrong strictly mangles honest output — a multi-line zod message is what the store
   really writes — and getting it loosely is the bug. Carriage return is stripped, which also turns
   a `CRLF` body into a `LF` one: the line break survives and the cursor move does not.
4. **A sanitiser is tested on a permitted case beside every refused one.** A sanitiser tested only
   on hostile input cannot tell a correct one from one that strips everything.

## Evidence

Hand-run through the real binary against a project holding a local skill whose `metadata.yaml`
carries the escape, output through `cat -v`. Before, the Name cell leaks `^[[2K^M`, `@oclif/table`'s
own `^[[22m` reset escapes, and the Description column collapses because the width was computed over
the escape bytes:

```
│ web-testing-hostile-probe │ Probe^[[2K^M M-bM-^@M-:   VERIFIED PUBLISHER ^[[22m              │ eject  │ web-testing │ Browser automation│
```

After:

```
│ web-testing-hostile-probe │ Probe M-bM-^@M-:   VERIFIED PUBLISHER │ eject  │ web-testing │ Browser automation kept on disk │
```

Binary control-byte census of the two runs: before `ESC=True CR=True`, after `ESC=False CR=False`
and no control byte other than newline.
