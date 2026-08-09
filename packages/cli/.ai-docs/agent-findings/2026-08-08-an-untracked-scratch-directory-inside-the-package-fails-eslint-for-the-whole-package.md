---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/eslint.config.js
  - .gitignore
standards_docs:
  - .ai-docs/reference/monorepo-layout.md
date: 2026-08-08
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: missing-rule
status: open
---

## What Was Wrong

`bun run lint` in `packages/cli` exits 1 on two files nobody wrote as source:

```
packages/cli/.verify-tmp/flows.verify.test.ts   22:13  error  Parsing error: Unexpected token {
packages/cli/.verify-tmp/plugin.verify.test.ts  26:32  error  Parsing error: Unexpected token :
```

`.verify-tmp/` is a scratch harness — `flows.verify.test.ts`, `plugin.verify.test.ts`, `harness.ts`
and a `vitest.config.ts` — written into the package root during a verification run. It is
**neither gitignored nor eslint-ignored**, and that combination is what turns it into a gate
failure:

| Layer                                 | Names `.verify-tmp`? | Consequence                                      |
| ------------------------------------- | -------------------- | ------------------------------------------------ |
| `.gitignore` (root or package)        | no                   | shows up as untracked working-tree material      |
| `eslint.config.js` -> `globalIgnores` | no                   | `eslint .` reads it                              |
| `eslint.config.js` -> `files` blocks  | no                   | it is not matched by any TypeScript-parser block |

The third row is the actual mechanism, and it is the one that makes the error message misleading.
The package's shared set is scoped by `files: ["src/**/*.ts", "e2e/**/*.ts", "scripts/**/*.ts"]`,
so a `.ts` file outside those three trees gets no TypeScript parser and ESLint reads TypeScript
syntax with a JavaScript parser. "Unexpected token `:`" is a type annotation. **The report names a
syntax error in a file whose syntax is fine**, which sends the reader looking for a defect that
does not exist.

Two things follow. The narrower one: a scratch directory inside a linted package breaks that
package's lint gate for everyone until it is deleted. The wider one is the shape worth keeping —
`globalIgnores` in this config lists five entries and four of them are build or cache output. There
is no entry for the class "material written into the package at runtime", and there is no rule
saying where a temporary harness should live so that it cannot join a lint run at all.

## Fix Applied

None — discovery only, and deliberately: the directory was being written to while this was found
(its files' mtimes moved during the pass), so deleting it would have raced whatever owns it, and
the two lint errors are not this task's to absorb.

Verified as independent of the work that found it: `eslint` over every file that task touched
exits 0, and the only other failure in the run — a default-project file-count cap tripped by two
new `scripts/*.ts` files — was fixed at source by raising the cap.

## Proposed Standard

1. **Scratch material belongs under a path that is ignored by construction, not by remembering.**
   `.gitignore` and `globalIgnores` are two lists that have to agree, and this directory is what
   happens when a third party writes a path neither anticipated. A single reserved prefix — one
   `.tmp-*/` or `.scratch/` entry added to both lists once — makes every future harness ignorable
   without an edit. `monorepo-layout.md` -> "Decisions a later change would otherwise undo" is where
   that convention belongs, beside the three tracked files named as `.gitignore` negations.

2. **A `files`-scoped ESLint config should say what happens to a `.ts` file outside its scope.**
   The narrowing to three source trees is correct and documented (it keeps root-level tool configs
   out of a type-aware run they would fail to parse under). What is not recorded is that the
   fallback for anything else is the JavaScript parser rather than exclusion — so an unanticipated
   `.ts` file does not get skipped, it gets misparsed, and the error blames the file. One sentence
   beside the `files` narrowing in `eslint.config.js` turns a confusing report into an expected one.
