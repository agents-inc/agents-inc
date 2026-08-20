---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/eslint.config.js
  - packages/cli/.prettierignore
  - .gitignore
date: 2026-08-18
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: missing-rule
status: resolved
resolved_by: >-
  `.scratch*` reserved in the repository-root .gitignore, in `globalIgnores` in
  packages/cli/eslint.config.js and in packages/cli/.prettierignore, with the parser mechanism
  written out beside the `files:` list in that ESLint config. Verified by hand against
  byte-identical probe files under a reserved and an unreserved prefix.
---

## What Was Wrong

Two things, one of which corrects a standing record.

**The reserved prefix did not exist.** The 2026-08-08 finding proposed it and nothing landed, so
every scratch harness written into the package stayed a gate failure until someone deleted it.

**The mechanism that finding recorded is more general than the one the config has.** It reads: "a
`.ts` file outside those three trees gets no TypeScript parser and ESLint reads TypeScript syntax
with a JavaScript parser". Measured under ESLint 10.8.0, against byte-identical valid TypeScript
placed at each location, that is not what happens:

| Scratch file                 | Outcome                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `.verify-tmp/harness.ts`     | skipped — "File ignored because no matching configuration was supplied" |
| `.verify-tmp/__tests__/b.ts` | skipped                                                                 |
| `.verify-tmp/__mocks__/c.ts` | skipped                                                                 |
| `.verify-tmp/e2e/d.ts`       | skipped                                                                 |
| `.verify-tmp/a.test.ts`      | **`Parsing error: Unexpected token interface`**                         |
| `.verify-tmp/e.test.tsx`     | **`Parsing error: Unexpected token interface`**                         |

Only two of `TEST_FILES`' five patterns reach outside the source trees, and the reason is that
`**/*.test.ts` and `**/*.test.tsx` NAME AN EXTENSION. A pattern that names one tells ESLint's
directory walk to go and find files with it, at any depth; the three directory-shaped patterns
(`**/__tests__/**`, `**/__mocks__/**`, `**/e2e/**`) name none, so they only apply rules to files
some other pattern already pulled in. The two blocks carrying the test patterns set rules and no
parser, so what they pull in is read by espree as JavaScript.

The correction matters because it inverts the advice. The general claim says any scratch `.ts` is
dangerous, which is both alarming and wrong; the measured one says the danger is precisely the
`*.test.ts` and `*.test.tsx` NAMES — which is exactly what a throwaway verification harness writes,
and why the original failure was two `*.verify.test.ts` files while the `harness.ts` beside them
passed unremarked. A reader working from the general claim cannot predict which of their four
scratch files will fail.

**A third list was missing from the count.** The 2026-08-08 finding names two lists that "have to
agree", `.gitignore` and `globalIgnores`. There are three. Prettier reaches a scratch file of ANY
name — `prettier --check .` from `packages/cli` reported `.verify-tmp/ugly.ts` — and the two
Prettier surfaces behave differently:

- From the repository root, `prettier --check .` honours the root `.gitignore`, so a root-gitignored
  prefix needs no root `.prettierignore` entry. Verified with an ugly file under `.wrangler`, which
  that file ignores: reported from `packages/cli`, silent from the root.
- From `packages/cli`, Prettier reads only the `.gitignore` in its working directory and there is
  none, so the prefix must be restated in `packages/cli/.prettierignore` — the same reason that file
  already restates `todo/*`, `CLAUDE.md` and `V2.md`, and says so.

`tsc` is the one gate that is safe by construction: `tsconfig.json` has `"include": ["src/**/*"]`,
so nothing outside `src/` reaches it.

## Fix Applied

`.scratch*` reserved in three places, unanchored so it holds at every level, with a trailing
wildcard so a harness can name itself (`.scratch-plugin-verify/`):

| List                            | Entry                       |
| ------------------------------- | --------------------------- |
| `.gitignore` (repository root)  | `.scratch*`                 |
| `packages/cli/eslint.config.js` | `.scratch*`, `.scratch*/**` |
| `packages/cli/.prettierignore`  | `.scratch*`                 |

The measured mechanism is written out beside `files: TYPESCRIPT_SOURCES` in the ESLint config,
which is the half that stops the next person losing a session: the error names a syntax error in a
file whose syntax is fine, so the report points at everything except the defect, which is the
file's LOCATION.

Verified by a controlled hand-run rather than by reasoning: byte-identical valid TypeScript placed
at `.scratch/harness.test.ts` and `.verify-tmp/harness.test.ts` in the same `eslint .` invocation.
The reserved copy was ignored, the unreserved copy reported `Unexpected token interface`. The same
pairing was run for `prettier --check .` from both directories and for `git check-ignore`.

## Proposed Standard

1. **A gate reservation is verified against every gate, not against the one that failed.** This
   directory's rule for scratch material was written from an ESLint failure and named ESLint and
   git. Prettier was equally affected and went unnamed for ten days, so a prefix added to the two
   named lists would have left `prettier --check .` red and the next agent would have concluded the
   reservation did not work. Before recording that N lists must agree, run the package's gate
   commands against the material and count them. `tsconfig.json`'s `include` is why `tsc` is not a
   fourth.

2. **A finding's mechanism is re-measured before it is quoted into a config comment or a rule.**
   The generalisation corrected here survived from the finding into a worklist row and into a task
   brief without anyone re-running it, and each hop made it sound better established. A mechanism
   that is about to be written somewhere permanent is worth one command; the check that caught this
   was placing the same file at six paths and reading which ones ESLint named.
