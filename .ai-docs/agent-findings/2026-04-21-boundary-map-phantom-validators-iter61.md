---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/boundary-map.md
  - .ai-docs/reference/features/compilation-pipeline.md
standards_docs:
  - .ai-docs/standards/documentation-map.md
date: 2026-04-21
reporting_agent: general-purpose
category: dry
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: phantom refs removed from boundary-map.md and compilation-pipeline.md (buildCompileAgents, validateTsConfig + loadConfig callers, resolveAllSources)
---

## What Was Wrong

Three phantom function references in `.ai-docs/reference/`:

1. **`buildCompileConfig()`** in `features/compilation-pipeline.md` (2 places) — never existed in source; actual helper is `buildCompileAgents()` in `installation/local-installer.ts`, with `CompileConfig` constructed as an inline object literal in `agent-recompiler.ts`.
2. **`validateFile()` + `VALIDATION_TARGETS`** in `boundary-map.md` — referenced as the "config mode" entry point in `schema-validator.ts`. Neither exists. Real flow: each config loader (`loadSkillCategories`, `loadSkillRules`, `loadStacks`, internal `validateTsConfig`) calls `loadConfig()` directly with the appropriate schema. `schema-validator.ts` only exports `formatZodErrors`.
3. **`resolveAgentsSource()`** in `boundary-map.md` (§5.1 entry points) — never existed. Real source-resolution entries are `resolveSource()` and `resolveAllSources()`.

Phantoms survive because the docs describe a _plausible_ architecture (factored validator, symmetric agent source resolver) that was either never implemented or refactored away without updating the doc.

## Fix Applied

- Rewrote the §2.2 Callers table in `boundary-map.md` to reference real functions (`validateTsConfig`, `loadSkillCategories`, `loadSkillRules`, `loadStacks`) in their actual files.
- Replaced `resolveAgentsSource()` with `resolveAllSources()` in §5.1.
- Rewrote the two `buildCompileConfig()` mentions in `features/compilation-pipeline.md` to describe the real `buildCompileAgents()` + inline `CompileConfig` construction.

## Proposed Standard

Add to `.ai-docs/standards/documentation-map.md` (or a new "reference-doc-discipline.md"): **any named function in a reference doc must be greppable in `src/cli/` at write time, and must be re-verified whenever the doc is edited.** Names that describe "what the system ought to do" without a concrete implementation (e.g. `validateFile`, `resolveAgentsSource`, `buildCompileConfig`) are the drift class — they sound right but cannot be located by Grep. A cheap audit: `grep -rhoE '\`[a-z][A-Za-z0-9_]+\(' .ai-docs/reference/`→ extract names →`grep`each in`src/cli/` → anything with zero hits is a candidate for deletion or correction.
