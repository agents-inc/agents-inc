---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/configuration/config-types-writer.ts
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/plugins/plugin-settings.ts
standards_docs:
  - todo/refactor-expressive-ts.md
date: 2026-07-19
reporting_agent: cli-developer
category: typescript
domain: shared
root_cause: rule-not-specific-enough
status: partial
partial_note: 'Inverted relative to the enum''s documented direction — the CODE side landed and the LEDGER-RULE side did not. Landed: the `SkillScope` conversion, and the trap sites are still correctly untouched — verified 2026-07-30 that `config-types-writer.ts` keeps its emitted `scope: "project" | "global"` template text, `plugin-settings.ts` keeps `RegisteredInstallation.scope` as a bare `string`, and the `wizard-store.ts` ternary uses per-branch `as const`. The Cluster A ledger line in `todo/refactor-expressive-ts.md` records the config-types-writer deviation inline. Pending: the generalisation — the ledger''s testing-gates preamble still carries no standing caveat naming generated-code template strings as the canonical false positive for grep-driven type substitutions, so the next union sweep gets no warning before it starts.'
---

## What Was Wrong

Pass 8 Cluster A asked to replace every inline `"project" | "global"` type
annotation with the new named `SkillScope` type across `src/cli`. A naive
grep-and-replace over that sweep hits three traps where the literal union is
NOT a source type annotation and must be left alone:

1. **Emitted generated-code strings** — `config-types-writer.ts` holds
   `PROJECT_CONFIG_TYPES_BEFORE`, a template string whose text is written to
   disk as the generated `config.ts`. Its `scope: "project" | "global"` lines
   are _value-position_ generated source, not annotations. Converting them to
   `SkillScope` would emit a reference to a type that doesn't exist in the
   generated file. Left untouched.

2. **A different-domain `string` field of the same values** —
   `plugin-settings.ts` `RegisteredInstallation.scope` is a bare `string`
   carrying Claude-CLI `"project" | "user"` values, and has no `excluded`
   field. It matches neither `SkillScope` nor the shared `ScopedEntry`
   (`{ scope?: SkillScope; excluded?: boolean }`) shape the ledger nominally
   pointed at (`plugin-settings.ts:100`). Left untouched.

3. **A ternary of string literals inferring `string`** — dropping the
   documented `newScope as "project" | "global"` cast in `wizard-store.ts`
   surfaced that `const x = cond ? "global" : "project"` widened to `string`
   in this position, breaking the `SkillConfig.scope` assignment. The sibling
   agent path already worked around this with `as const` on each branch.

## Fix Applied

- Converted only genuine type-position spellings (~52 sites, 21 prod + 5 test
  files) to `SkillScope` / `ClaudePluginScope`; left the three trap sites above
  as-is with inline deviation notes on the ledger lines.
- For the ternary, mirrored the sibling agent path: `("global" as const)` /
  `("project" as const)` on the branches instead of a trailing cast.
- Also removed a genuine anti-pattern uncovered in the same function
  (`classifySkillSourceRows`): a `list!.find(pred)!.source` double
  non-null-assertion that re-ran the same predicate already evaluated one line
  above — replaced by binding `installedGlobalConfig = find(pred)` once and
  branching on the truthy value so TypeScript narrows it.

## Proposed Standard

When a refactor ledger says "replace every inline `<union>` annotation", the
item should carry an explicit "TYPE-position only; skip: (a) template strings
that emit generated code, (b) same-valued fields of a different domain, (c)
literal-ternary sites that need `as const`" caveat. The Pass 8 Cluster A line
already said "only replace TYPE-position spellings; value-position literals
stay" — that phrasing is correct but easy to under-apply against generated-code
template strings specifically. Worth a one-line note in
`todo/refactor-expressive-ts.md`'s testing-gates preamble (or any future
consts/type-sweep spec) calling out generated-code template strings as the
canonical false-positive for grep-driven type substitutions.
