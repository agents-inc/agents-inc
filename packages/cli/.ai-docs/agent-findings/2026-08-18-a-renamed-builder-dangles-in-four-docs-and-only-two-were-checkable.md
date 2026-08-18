---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/commands/index.md
  - .ai-docs/reference/utilities.md
  - .ai-docs/reference/commands/edit.md
  - .ai-docs/reference/features/seed-contract.md
  - src/cli/utils/messages.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: cli-developer
category: architecture
domain: shared
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The two enumerating documents were repaired and bound to source by
  `scripts/check-enumeration-drift.ts` when this was filed. The four uncheckable prose references
  are now repaired too, by codex-keeper on 2026-08-18, and no file outside `agent-findings/` names
  the withdrawn symbol. `reference/commands/edit.md` — keywords list, Source Files list, and the
  confirm table, which was rebuilt rather than renamed because the plan's shape had moved with the
  behaviour (`kept` is now `statements`, ordered global-reach then kept, across two branches chosen
  by `isHomeDirectory`); its "What the run may not remove" table went from three fields to two, and
  a new section states outright that a global entry IS removed from a project.
  `reference/features/seed-contract.md` — the quoted `ReconcileOptions`/`KeptFromRoundTrip` block,
  the "Kept because" table, and the `withKeptEntries` fix-up table, which had claimed a
  `selectedAgents` fix-up that no longer happens. Confirms the finding's own narrower observation
  the hard way — every one of these needed rewriting rather than renaming, because the rename
  inverted the behaviour.
---

## What Was Wrong

`globallyInstalledKept` no longer exists. It became `globallyInstalledRemoved` when a project-scope
`edit --from` started REMOVING globally installed entries rather than keeping them — a rename that
inverted the meaning as well as the name — and a second builder, `unplaceableKept`, was added beside
it. Four documents still named the withdrawn symbol and none named the new one:

| Document                              | What it said                                                      |
| ------------------------------------- | ----------------------------------------------------------------- |
| `reference/commands/index.md`         | a row of the exhaustive builder table                             |
| `reference/utilities.md`              | a row of the same list, written out a second time with signatures |
| `reference/commands/edit.md`          | an import block, the `kept` row, and the Source Files list        |
| `reference/features/seed-contract.md` | prose naming the two disclosure builders                          |

This is the direction the 2026-08-18 predecessor called the worse of the two: a short list makes a
reader write a duplicate, but a list naming a symbol the source has lost sends them grepping for
nothing, after which the file stops being trusted at all. The import block in `commands/edit.md` is
the sharpest instance — it is quoted TypeScript, so a reader copying it writes code that does not
compile.

**The instructive part is that the totals were fine.** `reference/commands/index.md` claimed 32
builders and the module exports 33, so a count-only check would have flagged it by one and pointed
at nothing in particular. `reference/utilities.md` claimed 32 against the same 33. What was actually
wrong was three names: one present that should not be, two absent that should be. Every one of the
five predecessor filings was framed as a count, and framing it that way is part of why the fix kept
being "correct the number".

**A second writable copy is what let it survive.** `documentation-bible.md` § "A Count Lives in
Exactly One Document" already forbids two documents carrying one number, and the same list of
builders is written out in full in two documents with different owners. Neither knew about the
other, so repairing one would have left the other stale — which is exactly the history the
`STEP_TEXT` cluster records across `standards/e2e/README.md` and
`reference/testing/e2e-infrastructure.md`.

## Fix Applied

- `scripts/check-enumeration-drift.ts` built, with both copies of the builder list registered as
  separate rows, so neither can be repaired alone.
- `reference/commands/index.md`: `globallyInstalledKept(ids, names)` → `globallyInstalledRemoved(otherProjects)`
  with the consequence it actually states, and a new `unplaceableKept(skillIds)` row.
- `reference/utilities.md`: the same two corrections, with signatures, keeping the source order the
  section claims.
- `documentation-bible.md` § "A Count Lives in Exactly One Document" widened from count to
  membership, naming both directions and which is worse.

Not fixed: the four prose references in `reference/commands/edit.md` and
`reference/features/seed-contract.md`. They are outside the registry's shape — a registry row needs
a section that claims to enumerate something, and a sentence naming two builders claims nothing.

## Proposed Standard

The membership rule now in `documentation-bible.md` covers the checkable half. The uncheckable half
needs the existing rename rule extended, which the 2026-08-17 predecessor already proposed for
field renames inside quoted types:

> **A renamed or deleted exported symbol must be grepped for across `.ai-docs/` under its OLD name
> before the rename is finished**, not only in the documents that enumerate it. A registry row binds
> the lists; nothing binds a sentence, and a sentence naming a symbol that no longer exists costs
> the reader the same grep.

The narrower observation worth recording: this rename inverted a meaning as well as a name
(`Kept` → `Removed`), so a document left on the old name did not merely dangle — it described the
opposite behaviour under a symbol nobody could look up.
