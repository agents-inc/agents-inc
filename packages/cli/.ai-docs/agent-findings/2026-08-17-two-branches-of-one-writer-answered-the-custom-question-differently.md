---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/lib/configuration/config-types-writer.ts
  - packages/cli/src/cli/lib/config-gate/index.ts
  - packages/cli/src/cli/lib/configuration/config-generator.ts
standards_docs:
  - .ai-docs/reference/config/config-writer.md
date: 2026-08-17
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  CLI-516 moved all four axes onto "the loaded catalogue does not declare it", so the label no
  longer depends on which argument a literal arrived in and the two gate branches can no longer
  disagree. CLI-518 moved the matrix key sample behind verbose() and reworded the warning beside
  it. Both are covered by unit specs and confirmed by hand-run.
---

## What Was Wrong

Two things the same day's rows named separately turn out to be one lesson. The sibling row covered
one half of it — that `generateConfigTypesSource` derived "custom" from the `extras` argument, and
`buildProjectTypesExtras` makes `extras` the entire configuration — and the half below was recorded
nowhere.

**The `// Custom` label depended on which branch of the gate wrote the file, not on the data.**
`writeScopeConfigTypes` passes `extras` straight through on the home branch (undefined when the
caller supplied none) and defaults them from the config on the project branch:

```ts
if (isHomeDirectory(projectDir)) return writeGlobalTypesHalf(config, ..., extras); // may be undefined
await regenerateConfigTypes(projectDir, ..., extras ?? buildProjectTypesExtras(config, matrix));
```

While "custom" meant "arrived in `extras`", those two branches answered the question differently
for the same installation: a `compile` at a home root labelled every id `// Marketplace` — including
ids no catalogue declares — and the same config written from a project context labelled the whole
union `// Custom`. Neither was reading the data. This is the CLI-515 defect (one question, two
spellings) in a place nobody was looking for it, and it is why the e2e specs that snapshot a
compile's `config-types.ts` were green against the wrong answer.

**A hand-run confirmed a second thing about the diagnostic CLI-518 reworded: it cannot fire from
the wizard at all.** An id the matrix does not carry is pruned during restore, with its own
plain-English statement — `- acme-house-tooling [P] (not present in agents-inc)` — before
`generateProjectConfigFromSkills` sees it. The warning is reachable only through the `--from`
producers, which keep an unplaceable id deliberately (CLI-511). That is the whole reason a
developer diagnostic sat unnoticed on a user-facing path for so long: until CLI-511 there was no
sanctioned path that reached it.

## Fix Applied

All four axes of `generateConfigTypesSource` now derive their label from what the loaded catalogue
declares: `isCustomSkill` (absent from `matrix.skills`, or flagged `custom: true`), `isCustomAgent`
(absent from the loaded agent set, or flagged), `isCustomDomain` (carried by no declared category)
and the existing `isUndeclaredCategory`. `collectCustomDomains` is deleted — its category half
could no longer fire under the category rule, and its `extraDomains` half was the defect.

`local: true` was deliberately NOT taken as a second custom signal: an ejected catalogue skill is
copied into `.claude/skills/` and rediscovered as local, so reading it would label the catalogue's
own work as the user's — the same class of error, inverted.

In `config-generator.ts`, `resolveValidSkills` no longer prints `Matrix keys sample: [...]` to the
user; the sample moved to `verbose()` and the warning beside it now states the outcome (the entry
stays in the configuration, no sub-agent is given the skill) and both ways out.

## Proposed Standard

`reference/config/config-writer.md` owns the config-types writer and should carry the rule as one
line, because it is the rule all four axes now share:

> A `// Custom` label means the loaded catalogue does not declare the thing. It is never inferred
> from which argument the literal arrived in — `extras` is a statement about timing, not authorship
> — and never from a signal that survives ejection, such as `local: true`.

The same document should note that `collectCustomDomains` is gone and that
`writeScopeConfigTypes`'s two branches differ in how they fill `extras`, so a rule keyed on extras
is a rule with two answers.
