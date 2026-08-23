---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/.ai-docs/reference/concepts/scope-system.md
  - packages/cli/.ai-docs/reference/features/configuration.md
  - packages/cli/scripts/check-enumeration-drift.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-19
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  Owner ruling 2026-08-20 took neither proposed option and settled a third: duplication across
  documents is allowed, and the checker watches both copies. Implemented as a SECOND REGISTRY ROW
  rather than a multi-document field — `RegistryEntry` is unchanged, and the two rows share one
  `source` the way the two `STEP_TEXT` rows above them already do, because each copy is separately
  wrong. `scope-system.md`'s line saying the table is "a second copy with nothing binding it" was
  corrected in the same change; it now says both are bound. Non-vacuity proved by mutation —
  deleting the `activeAgentScopeMap` row from that table reports drift naming the scope-system
  claim alone.
---

## What Was Wrong

`scripts/check-enumeration-drift.ts` binds the exported functions of
`src/cli/lib/configuration/scope-predicates.ts` to a table in
`reference/features/configuration.md`. That registration is what makes the owning table trustworthy,
and it works: the owning table names all eight functions, `activeAgentNames` included.

`reference/concepts/scope-system.md` § Scope Predicates carries a **second table of the same
enumeration**, headed `Export` with a `Meaning` column, and nothing binds it. It named seven of the
eight. The registry cannot see it, because a registry row names one document — so the guarded copy
and the unguarded copy disagreed and only the unguarded one could drift.

This is the shape the bible already prohibits for numbers ("A Count Lives in Exactly One Document")
and extends to membership ("The same rule governs membership, not just the total"). What it does not
yet say is what to do when the second copy is **useful** — a concepts document explaining scope
classification wants the predicate meanings inline, and demoting it to a bare cross-link costs the
reader the thing they came for. So the rule as written has no answer for the case that produced the
drift, and a doc author following it can reasonably keep writing the second copy.

The symmetric hazard sits in the registry rather than the documents: a registry row silently
sanctions every unregistered copy elsewhere, because a pass that runs the drift checker and sees it
green has confirmed one document and learned nothing about the others.

## Fix Applied

The missing `activeAgentNames` row was added to `scope-system.md`, and a line above the table now
names `features/configuration.md` as the owner of the drift-bound list, so a reader knows which copy
is guarded. That fixes the instance, not the class — the second copy is still unguarded and will
drift again on the ninth export.

The section's **Consumers** table was completed in the same pass (it named five of the eleven
non-test importers) and now carries the grep that re-derives it.

## Proposed Standard

Two options, and the choice belongs to the documents' owner rather than to a sweep passing through:

1. **Let a registry row bind more than one document.** `SourceEnumeration` already pairs a file with
   a symbol; the document side is what is singular. A row listing two documents would guard both
   copies and cost one field. This is the option that removes the class.
2. **Rule the second copy out.** State in `documentation-bible.md`, beside the membership rule, that
   an enumeration registered in `check-enumeration-drift.ts` may appear in exactly one document, and
   that every other document links to it. Cheaper, and it loses the inline meanings that made the
   duplicate worth writing.

Either way, `documentation-bible.md` should say what a **second copy of a registered enumeration**
is, because at present the registry's greenness reads as a guarantee about the enumeration rather
than about one table of it.
