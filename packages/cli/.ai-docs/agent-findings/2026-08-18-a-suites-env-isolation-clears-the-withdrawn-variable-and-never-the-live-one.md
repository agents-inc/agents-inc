---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/loading/source-loader.test.ts
  - src/cli/lib/configuration/config.ts
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
date: 2026-08-18
reporting_agent: codex-keeper
category: testing
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`src/cli/lib/loading/source-loader.test.ts` isolates itself from an ambient marketplace override
with four statements across two `beforeEach` / `afterEach` pairs:

```ts
delete process.env.CC_SOURCE;
```

`CC_SOURCE` is not read anywhere in `src/`. The variable the resolution chain consults is
`SOURCE_ENV_VAR` in `src/cli/lib/configuration/config.ts`, whose value is `CC_MARKETPLACE`;
`readEnvSource()` is the only reader and it reads that name alone. The suite never clears
`CC_MARKETPLACE`.

So the isolation is a no-op in both directions. A developer or CI runner with `CC_MARKETPLACE`
exported has it reach every `loadSkillsMatrixFromSource` call in the file, and the deletes that look
like they prevent exactly that prevent nothing. Nothing fails: the tests pass with the variable set,
because the fixtures they build usually name a source explicitly, so the leak only decides the cases
that do not — which is the subset an env-precedence test is about.

The rename is old enough that a sibling suite already treats the old name as historical:
`src/cli/lib/configuration/config.test.ts` binds it as `WITHDRAWN_SOURCE_ENV_VAR` and asserts it
steers nothing. That file is right; this one was never swept.

## Fix Applied

None. Reported rather than patched: the deletes are load-bearing-looking and whoever owns the suite
should decide whether they become `delete process.env[SOURCE_ENV_VAR]` (importing the constant, so
a future rename takes the suite with it) or whether the isolation belongs in a shared setup file
alongside the other ambient-env guards.

## Proposed Standard

**A test that clears an environment variable must clear it through the constant the product reads,
not through a literal.** A literal cannot be renamed by a sweep, cannot be found by "grep for the
constant's callers", and fails silently — the suite keeps passing whether the isolation works or
not, because the variable being cleared is one nothing sets. Importing `SOURCE_ENV_VAR` makes the
isolation a call site of the thing it isolates against, which is the only form a rename cannot
strand.

The general shape is broader than env vars: any test-side statement whose whole purpose is to name
the same string the product names is a duplication that only shows up as a defect once the two
disagree, and nothing looks red on the day they do.
