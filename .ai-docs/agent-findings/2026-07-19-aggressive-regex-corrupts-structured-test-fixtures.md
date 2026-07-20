---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/__tests__/mock-data/mock-matrices.ts
  - src/cli/lib/matrix/matrix-resolver.test.ts
  - src/cli/lib/configuration/__tests__/config-types-writer.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-19
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: All corrupted regions manually reconstructed and re-verified (740 + 222 consumer tests green, full unit 5045 pass); remaining item-17/20 adoptions completed with targeted per-site edits only.
---

## What Was Wrong

While mechanically adopting the `buildCategoryMap(...)` helper across ~48 `X as Record<Category, CategoryDefinition>` cast sites (Cluster F item 17), a global non-greedy `perl -0777` regex was used to wrap object literals:

- `s/categories: (\{.*?\}) as Record<Category, CategoryDefinition>/categories: buildCategoryMap($1)/gs`
- `s/= (\{.*?\}) as Record<Category, CategoryDefinition>;/= buildCategoryMap($1);/gs`

Because test fixtures contain **cast-less** `categories: {` blocks and `= {` expressions interleaved with the cast-bearing ones, the non-greedy `.*?` (with `/s`) crossed statement — and even string-literal — boundaries searching for the next ` as Record<...>`. This mis-aligned the inserted `buildCategoryMap(` opening from its matching `)`, and in `config-types-writer.test.ts` it rewrote the **expected string** inside two assertions (`expect(source).toContain("export type StackAgentConfig = {")` became `"...= buildCategoryMap({"`) — a silent behavior change that `tsc` does not catch (valid syntax, wrong content).

The corruption was recoverable but cost significant effort to diagnose and reconstruct by hand.

## Fix Applied

- Manually reconstructed every corrupted region (misplaced brackets restored; the two corrupted assertion strings restored to their original expected values).
- Re-verified via the full consumer suites (matrix/stores/components 740 tests, matrix-resolver/config-types-writer/step-build 222 tests) plus the full unit run (5045 pass / 0 fail).
- Completed the remaining item-17 and item-20 adoptions using **targeted, per-site `Edit` calls or exact-string `replace_all`** — never structural regex — and typechecked after each file.

## Proposed Standard

Add to the test-infra / refactoring conventions (e.g. a "Mechanical refactor safety" note in `.ai-docs/standards/e2e/anti-patterns.md` or the CLI test-infra standards):

> **Never use greedy/non-greedy multi-line regex (`perl -0777 .*?`, sed ranges) to transform structured TypeScript.** Balanced braces, interleaved cast-less siblings, and string literals cannot be matched reliably; over-matching silently corrupts brackets AND assertion strings (which `tsc` won't flag). For adopting a wrapper helper across N call sites, use exact-string `replace_all` for the leaf token only, or per-site `Edit`, and run `tsc --noEmit` + the file's tests after each file. Reserve regex for single-line, token-level, whitespace-insensitive substitutions.
