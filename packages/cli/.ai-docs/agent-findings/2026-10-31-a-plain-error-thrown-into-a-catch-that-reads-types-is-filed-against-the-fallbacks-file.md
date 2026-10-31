---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/stacks/stacks-loader.ts
  - src/cli/lib/source-validator.ts
  - src/cli/lib/configuration/config-loader.ts
  - src/cli/lib/matrix/matrix-loader.ts
  - src/cli/lib/loading/source-loader.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-31
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  Every config/skill-rules.ts failure is now filed against that file too (ConfigEvaluationError,
  ConfigDefaultExportError, ConfigSchemaError or NoSkillRulesError at the rules path).
  refuseCatalogueCollisions still falls through to config/skill-categories.ts.
---

## What Was Wrong

`checkCrossReferences` in `source-validator.ts` catches whatever the marketplace load throws, and
`matrixLoadFailure` tells failures apart by `instanceof`. Anything it does not recognise falls
through to one fallback: a warning filed against `config/skill-categories.ts`, saying "failed to
load categories/rules". `loadStacks` threw a plain `Error`, so a broken stacks file (default or
declared path) sent `doctor`'s reader to open a categories file that was fine. The only thing that
marked the failure as the stacks file's was its message text.

The fallback is not the defect; the throw is. Each loader inside that load decides, by throwing a
plain `Error`, that no caller can ever tell its failure apart. Census of the plain throws inside the
load, run 2026-10-31 from `packages/cli`:

```
grep -n "throw new Error(" src/cli/lib/loading/source-loader.ts src/cli/lib/matrix/matrix-loader.ts src/cli/lib/configuration/config-loader.ts src/cli/lib/stacks/stacks-loader.ts
```

It listed `importConfigModule` (`config-loader.ts`, any config that does not parse),
`refuseCatalogueCollisions` (`source-loader.ts`), the local-skill guard (`source-loader.ts`, outside
this load) and `loadSkillCategories` / `loadSkillRules` (`matrix-loader.ts`, a config exporting
nothing), plus the `loadStacks` throw this finding fixed.

## Fix Applied

`loadStacks` throws `StacksLoadError` (same message, cause kept). `matrixLoadFailure` files a
`StacksLoadError` against the stacks file `validateSource` resolved, and a `ConfigSchemaError` whose
`configPath` is the rules file against `config/skill-rules.ts`. Specs: "the cross-reference warning
when a file the load reads fails to load" in `source-validator.test.ts`, with a refused categories
file as its control.

## Proposed Standard

`clean-code-standards.md` § 3: a loader whose caller tells failures apart throws a typed error,
never a plain `Error`, with a path field where one type covers several files (`ConfigSchemaError`'s
`configPath`); the caller reads the type and that field, never the message. No conflict with `CLAUDE.md`; it states for the throwing side what the "Read off
the throw's type, never its text" comments in `source-loader.ts` already ask of the catching side.
