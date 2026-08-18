---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/DOCUMENTATION_MAP.md
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/reference/config/configuration.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: codex-keeper
category: architecture
domain: infra
root_cause: enforcement-gap
status: partial
partial_note: >-
  Docs-side landed: the map's Covers cells, both file-count pairs, the Pointers table and the
  ESLint gate prose are re-derived, and the bible's task-ID rule is now unconditional. Pending on
  the code side: nothing binds an index-level file count to disk, and `reference/config/
  configuration.md` still carries a task ID in a redirect row.
---

## What Was Wrong

**A Covers cell claimed a subject the document has never held.** `DOCUMENTATION_MAP.md` billed
`reference/features/wizard-flow.md` as covering "feature-flag gating". `feature.flag|featureFlag`
matches nothing in that document, nothing in `src/cli/components/wizard/`, and nothing in
`src/cli/stores/wizard-store.ts`. The document's fifth subject is cancellation semantics — a section
naming which step owns ESC, what Ink does with Ctrl+C, and why `onCancel` does not call `exit()`.
A Covers cell is a routing decision: an agent looking for feature flags was sent to a document that
could not answer, and an agent looking for cancellation was not sent there at all.

**Both file-count pairs were stale in both halves.** The Coverage section said 376 / 148 for
`src/cli/` and 257 / 218 for `e2e/`; disk says 380 / 151 and 266 / 223. The `e2e` split was wrong in
a second way — it read 215 `*.e2e.test.ts`, where the `e2e` project's own `include` glob matches 220.
The section already instructs "re-derive with `find`, never carry forward", so the rule was in place
and nothing enforced it.

**Two documents were filed as the wrong kind.** `standards/e2e-testing-bible.md` was converted to a
redirect stub but its row stayed in the Standards table, where it read as a live rule set. In the
other direction `reference/type-system.md` sat in the Pointers table under a preamble asserting each
entry "holds a redirect table and no content" — while owning the five union member counts and the
whole `AGENT_NAMES` roster, which `scripts/check-enumeration-drift.ts` binds to
`src/cli/types/generated/source-types.ts`. Nine other documents cite it as that owner.

**The ESLint gate described a config the package stopped having.** The prose said the config sits on
`js.configs.recommended` + `tseslint.configs.recommended`. `eslint.config.js` composes neither: it
extends `baseConfig` and `typeCheckedConfig(import.meta.dirname)` from `@workspace/eslint-config/base`,
which bring `recommendedTypeChecked` as well and add three rules beyond the recommended sets —
`no-self-compare`, `@typescript-eslint/no-unnecessary-condition` and
`@typescript-eslint/consistent-type-assertions`.

**The ban on task IDs in `.ai-docs/` admitted two readings, and an agent was asked to arbitrate it.**
`documentation-bible.md` rule 3's headline was absolute, but its reasoning was entirely about DEAD
IDs and its Self-Correction Triggers row read conditionally — "Check the trackers; if absent, name
the behaviour" — which sanctions a live ID. The premise behind the conditional does not hold: a live
ID may already be unresolvable or ambiguous, and both live IDs on the wizard pages were. One is an
open row whose ID appears in no file under `src/`, `e2e/` or `scripts/`, so a reader has nothing to
grep for; the other was renumbered after a collision, so one ID names two rows — and a JSDoc in
`src/cli/lib/wizard/scope-diff.ts` still cites the dangling one, meaning the reference has already
escaped `.ai-docs/` into source.

## Fix Applied

Bible rule 3 now bans IDs live or dead, carries one clause of evidence for each failure mode, and
names its own sanctioned uses (an ID quoted as a specimen of the rule; `agent-findings/`). The
trigger row is unconditional, and the Quality Standards anti-pattern row is relabelled from "Dead
task IDs" to "Task IDs" — it was the third place the conditional reading survived.

In the map: the wizard-flow Covers cell now reads "cancellation semantics"; both count pairs are
re-derived from `find`, with the `e2e` split tied to the two `include` globs in
`e2e/vitest.config.ts` that create it; `standards/e2e-testing-bible.md` moved to Pointers and
`reference/type-system.md` moved to Types; the Pointers preamble now states the test that decides
which table a document belongs in. Three further Covers cells gained a subject their document
gained (`component-patterns.md` owns the `hotkeys.ts` export list, `state-transitions.md` gained
per-screen structural keys, `operations-layer.md` covers compiled-agent removal and pruning), and
the ESLint prose names the shared config, its three additions, and `spec-gates.test.ts` as the
mutation proof for the selector family.

## Proposed Standard

**1. Bind the index's file counts, or state that nothing does.** These four numbers are the only
claims in `.ai-docs/` derived by counting files rather than reading symbols, and
`scripts/check-enumeration-drift.ts` cannot take them: its registry rows bind a document section's
named members to an exported symbol's members, and there is no symbol whose members are "the files
under `src/cli/`". A `find`-shaped row is a different checker. Until one exists the Coverage
section's "re-derive with `find`" instruction is the only guard, and it failed silently through at
least two passes. Either add the checker or record in `documentation-bible.md` § "A Count Lives in
Exactly One Document" that this family is unbound and must be re-derived on sight.

**2. Give `documentation-bible.md` the test that separates a stub from a body**, alongside the
`last_validated` rules: a redirect stub holds redirect rows and nothing else; the moment it states a
fact no destination owns, it is a body and must be filed as one. Both directions were live at once
here, and both are silent — a reader who finds the fact in the stub has no way to know it is not
supposed to be there.

**3. Sweep the remaining task IDs out of `reference/`.** With rule 3 now unconditional,
`reference/config/configuration.md` carries "the D-220 delta pipeline" in a redirect row, and the
`scope-diff.ts` JSDoc cites the renumbered ID. Neither is in scope for a map pass; both are now
unambiguously violations, and the ESLint `no-restricted-syntax` guard that catches this class
reaches test names and assertion messages only — never prose or JSDoc.
