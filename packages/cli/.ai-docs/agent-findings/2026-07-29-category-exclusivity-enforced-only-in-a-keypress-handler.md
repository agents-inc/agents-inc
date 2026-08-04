---
type: missing-standard
severity: high
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/configuration/config-writer.ts
  - src/cli/lib/matrix/matrix-resolver.ts
standards_docs:
  - .ai-docs/reference/concepts/scope-system.md
  - .ai-docs/reference/concepts/tombstone-pattern.md
date: 2026-07-29
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  Code-side fix HAS shipped (this is the inverse of the usual partial direction): cross-scope
  category exclusivity is now enforced on the write path by a shared reconciliation helper in
  local-installer.ts, applied at BOTH project-config write sites. Still pending: (1) the proposed
  "Invariants vs. interaction rules" section in clean-code-standards.md and its cross-link from
  scope-system.md; (2) the validator corollary — validateExclusivity / validateSelection in
  matrix-resolver.ts still have zero production callers and still hardcode `valid: true`, and were
  deliberately left untouched (the fix does not route through them).
---

## What Was Wrong

`CategoryDefinition.exclusive` ("at most one skill selected in this category") is enforced in exactly one
place in production code: `toggleTechnology` in `src/cli/stores/wizard-store.ts`, which is a keyboard
handler. It is a UI interaction rule, never a data invariant on `ProjectConfig.skills`.

Every non-keypress path that can add a skill to a project config therefore bypasses it. The cross-scope
write paths (`synthesizeGlobalTombstonesForOwnedSkills` in `local-installer.ts`, `partitionInlinedConfigEntries`
in `config-writer.ts`) both reconcile on **skill-id equality**, so a project owning Angular at project scope
and a global install of React produce two active skills in the exclusive `web-framework` category inside the
project's `config.ts`. Verified against the built CLI: the compiled agent then advertises both React and
Angular under "Available Skills", `doctor` reports "Skills Resolved ✓ 2/2", `validate` reports 0 errors.

A pure validator for this invariant already exists and is exported — `validateExclusivity` /
`validateSelection` in `src/cli/lib/matrix/matrix-resolver.ts` — but it has **zero production callers**
(only tests). It also hardcodes `valid: true` in its return value regardless of the errors it collected,
so even a caller that wired it up would read the wrong verdict from `.valid`.

## Fix Applied

Code side, in `src/cli/lib/installation/local-installer.ts`: a single shared
`reconcileProjectSplitAgainstGlobal` helper now runs immediately before the inlining writer at
BOTH sites that write a project `config.ts` — `propagateGlobalChangesToProjects` and the
project-scope save branch of `writeScopedConfigs`. It masks a live global skill with a
`{ scope: "global", excluded: true }` tombstone when the project owns either the same id or a
DIFFERENT active skill in the same matrix-declared `exclusive` category, so the grouping-keyed
constraint is enforced alongside the existing identity-keyed one. Flags are read from the merged
matrix passed in (not `defaultCategories`), so source-repo category overrides are honoured.

The rule was deliberately NOT pushed into `partitionInlinedConfigEntries` in `config-writer.ts`:
that function operates on JSON-round-tripped `unknown[]` and the module intentionally has no
matrix dependency; adding one would invert the layering and force a matrix argument onto
`writeConfigFile`.

Standards-doc side is NOT done — see `partial_note`.

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md` (new "Invariants vs. interaction rules" section), and
cross-link from `.ai-docs/reference/concepts/scope-system.md`:

> A rule that constrains the **shape of persisted data** (config.ts, config-types.ts, the compiled stack)
> must be enforced on the write path, not in a keypress handler. A store action such as `toggleTechnology`
> may enforce it _additionally_, for immediate feedback, but it is never the only enforcement point:
> propagation, hand-edits, and cross-scope inlining never route through the keyboard.
>
> Corollary for cross-scope reconciliation: any reconciliation keyed on **identity** (`id` / `name`) is
> incomplete for constraints that are keyed on a **grouping** (category exclusivity, `conflictsWith`).
> When adding a cross-scope reconciliation rule, state explicitly which key it uses and which class of
> constraint it therefore cannot see.
>
> Corollary for validators: an exported validator with no production caller is a documented invariant that
> is not actually enforced. Either wire it in or delete it — do not leave it as evidence that the rule holds.
