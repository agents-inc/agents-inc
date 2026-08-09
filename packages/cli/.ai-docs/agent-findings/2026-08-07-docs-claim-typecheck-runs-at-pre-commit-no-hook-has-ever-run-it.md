---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/.ai-docs/reference/build-and-packaging.md
  - packages/cli/.ai-docs/reference/features/code-generation.md
  - .husky/pre-commit
  - .husky/pre-push
standards_docs:
  - .ai-docs/reference/monorepo-layout.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: "REPO-33, owner ruling 2026-08-08 — `typecheck` joined .husky/pre-commit's turbo line (`turbo run lint typecheck test --filter='...[HEAD]'`), taking the first branch of the Proposed Standard's option 1 at commit rather than push. Both sentences were re-verified against the shipped hook and are now true; the two neighbouring statements the change made stale (code-generation.md's pre-commit table row and its 'runs lint and test' prose) were corrected with it"
---

## What Was Wrong

In plain terms: two reference documents say TypeScript is type-checked every time you commit. It is
not, and it never was. `typecheck` runs in CI and at publish only.

Found while splitting the hooks for REPO-32, which required reading every doc that describes
pre-commit behaviour.

Both claims:

- `reference/build-and-packaging.md` — "Both are now checked on every pre-commit, every CI run and
  every publish."
- `reference/features/code-generation.md` — "so `scripts/` is type-checked at pre-commit, in CI and
  at publish."

What the hooks actually run, verified against the files themselves:

| Gate                       | Commands                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `.husky/pre-commit`        | `bunx lint-staged`, `bun run deps:check`, `bunx turbo run lint test --filter='...[HEAD]'` |
| `.husky/pre-push`          | `bun run deps:check`, `bunx turbo run lint test test:e2e` per side                        |
| `prepublishOnly`           | `format:check && lint && typecheck && …`                                                  |
| `.github/workflows/ci.yml` | `bun run typecheck` in both `check-cli` and `check-web`                                   |

No `typecheck` in either hook. The turbo tasks the hooks do run are `lint` (`eslint .`), `test`
(`vitest run`) and `test:e2e` — none of which invokes `tsc`. `typecheck` is a separate script
(`tsc --noEmit && tsc -p tsconfig.scripts.json --noEmit && tsc -p e2e/tsconfig.json --noEmit`) that
no hook calls.

**This predates the hook split.** The hook before 2026-08-07 ran `lint test test:e2e` and no
`typecheck` either, so the claim was already wrong when it was written — the split neither caused it
nor changed it. It is recorded here rather than silently corrected because the two sentences make a
load-bearing argument (`scripts/` and `e2e/` were brought under a composite gate precisely so they
could not drift again), and whether the answer is "fix the sentence" or "add `typecheck` to a hook"
is a decision about how much a commit should cost, not a wording choice.

The two are not equivalent in cost. `typecheck` is three `tsc` programs; adding it to `pre-commit`
would run them for every changed package on every commit. Adding it to `pre-push` costs the same
three programs once per side, on a hook that already runs the end-to-end suites.

## Fix Applied

None — discovery only. REPO-32's own doc updates were limited to what the hook split made stale:
the `pre-commit`/`pre-push` rows and prose in `reference/monorepo-layout.md` and
`reference/features/code-generation.md`. The typecheck sentences were left as found, in both files,
so that the decision below is made deliberately rather than absorbed into an unrelated change.

## Proposed Standard

1. **Decide, then make the docs match the decision** — not the other way round. Either add
   `bunx turbo run typecheck` to `.husky/pre-push` (where the expensive gates already live, and
   where CI's own composition is mirrored), or correct both sentences to say "in CI and at publish".
2. **A doc that names a gate must name the command that runs it.** The same rule the
   2026-07-30 ESLint finding proposed for `CLAUDE.md`'s Pre-Commit Checklist applies to reference
   prose: "checked at pre-commit" is only verifiable if the hook file contains a command that does
   the checking. `reference/monorepo-layout.md` -> "The commit and push hooks" is the one place that
   lists both hooks stage by stage, and any other document making a claim about when something runs
   should defer to it rather than restate it.
