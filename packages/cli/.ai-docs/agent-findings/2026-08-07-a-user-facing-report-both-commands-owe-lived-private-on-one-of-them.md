---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/base-command.ts
  - src/cli/commands/init.tsx
  - src/cli/commands/edit.tsx
  - src/cli/lib/seed/seed-to-wizard.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: the code fix shipped (the reporter moved to BaseCommand and init now calls it); no standard was written, and the `init --from` route still has nothing to report because its producer hardcodes an empty validation
---

## What Was Wrong

`WizardResultV2.validation` is produced identically by both commands that run the wizard: the
wizard calls `validateSelection(allSkills)` in `handleComplete` and stamps the result onto every
`WizardResultV2` it emits. Both `init` and `edit` therefore received the same answer to the same
question about the same matrix.

Only `edit` read it. `reportValidationErrors` was a **private method on `Edit`**, called on line
155 of `edit.tsx`; `init.tsx` never touched `selection.result.validation` on either of its two
routes. A roster with a conflicting pair, an unmet requirement or two picks in an exclusive
category was therefore reported or not depending on which command the user happened to reach it
through — silent on the install, warned about the first time they opened `edit`.

This is not a missing feature. Both commands **computed** the same warning; one of them discarded
it. The reason it could drift is structural: nothing about a private method on one command says
that its sibling owes the same output, and nothing failed when the sibling did not. The two
commands already share `BaseCommand`, which is where every other cross-command posture lives —
`ensureConfigReadable`, `requireMarketplaceOrExit`, `handleError`, `ensureDirOverwritable`. The
report was the one that did not make it there.

The asymmetry survived a 23-agent live-CLI sweep and was recorded in `todo/cli.md` under CLI-364
as "the one real init/edit asymmetry" — visible, named, and still not fixed, because there was no
rule that made it anyone's obligation.

## Fix Applied

`reportValidationErrors` moved from `Edit` to `BaseCommand`, narrowed to take the
`SelectionValidation` it actually needs rather than the whole wizard result. `edit` calls
`this.reportValidationErrors(result.validation)`; `init` calls
`this.reportValidationErrors(selection.result.validation)` on its shared spine — after the cancel
guard, before the empty-selection refusal — so both of its producers pass through the same call
rather than either one growing its own copy. The redundant `if (errors.length > 0)` wrapper around
the loop went with the move: a loop over an empty array is its own guard.

Severity and exit posture are unchanged and now unchangeable independently: these are advisory
(`ValidationError` in `types/matrix.ts`), so they are `this.warn` and neither command's exit code
turns on them.

Covered by `src/cli/lib/__tests__/commands/init-edit-validation-parity.test.ts`, which drives both
commands over ONE validation result produced by the production validator and compares the emitted
warnings with `toStrictEqual` — parity of wording and order, not of presence — plus an accepted
selection as the negative control. `e2e/interactive/init-wizard-validation-warning.e2e.test.ts`
drives the real binary through a source whose React skill requires a framework the stack never
selects, and asserts the warning appears where nothing appeared before.

**Residual — `init --from` is covered structurally, not observably.** `seedToWizardResult` returns
`validation: { valid: true, errors: [] }` unconditionally, with a comment stating that a shared
configuration was already validated by the app that built it. The shared-spine placement means the
`--from` route now reports whatever its producer computes; today that is nothing. Whether it should
re-validate against the local catalog is a genuine product question and was deliberately left
alone: the decode SKIPS ids this catalog does not know, so a payload that was internally consistent
where it was authored can arrive here with a real unmet requirement — an argument for validating —
while the same skipping is what could make the warning read as the sharer's fault rather than the
catalog's. That call needs an owner ruling, not a sub-agent's.

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md`, in the command-layer section:

> **A user-facing report that two commands both compute belongs on `BaseCommand`.** When more than
> one command derives the same fact about the same data — a validation summary, a permission
> notice, a propagation summary — the rendering of that fact is shared, not copied and not private
> to whichever command wrote it first. A private reporting method on one command is only correct
> when no sibling command holds the same data. Check before writing one: if a sibling's result type
> carries the field, the method belongs on the base class.

The concrete tripwire that would have caught this one is narrower and worth stating with it: **a
field on `WizardResultV2` that only one of its consumers reads is a defect until proven otherwise.**
`unresolvableSkillIds`, `assignedStack` and `validation` are all produced for every consumer;
`validation` was the one being dropped, and a grep for its read sites would have shown one command
reading and one ignoring.
