---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/testing/e2e-infrastructure.md
  - .ai-docs/DOCUMENTATION_MAP.md
  - .ai-docs/standards/documentation-bible.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-19
reporting_agent: codex-keeper
category: architecture
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Docs-side landed - the four annotations are gone from the tree diagram and the command list now
  agrees with disk in both directions. Pending - the bible's owned-count table still says "totals",
  which is the wording that let four finer-grained copies read as in-scope, and nothing binds a
  directory listing in a tree diagram to disk.
---

## What Was Wrong

`DOCUMENTATION_MAP.md` -> Coverage states its own rule in the section: "This section owns the source
and E2E file totals; no other doc restates them." `documentation-bible.md` -> A Count Lives in
Exactly One Document names the same owner - "Source-file and E2E-file totals" -> `DOCUMENTATION_MAP.md`.

`reference/testing/e2e-infrastructure.md`'s directory tree carried **four** E2E file counts anyway,
one per spec directory:

| Annotation                                        | Doc said | Disk |
| ------------------------------------------------- | -------: | ---: |
| `commands/ # Command (non-interactive) E2E tests` |       56 |   57 |
| `interactive/ # Interactive wizard E2E tests`     |       65 |   65 |
| `lifecycle/ # Lifecycle E2E tests`                |       92 |   92 |
| `integration/ # E2E integration tests`            |        5 |    5 |

**The word that let them through is "totals".** The map owns aggregates - 266 `e2e/` files, 223
specs - and a per-directory breakdown shares no number with them, so a reader checking "is this
count restated anywhere?" compares 57 against 266, finds no collision, and concludes the annotation
is the document's own. It is the same count sliced finer, and the bible's own sentence directly
above forbids the shape independently: "Annotations in an index, a tree diagram or a 'covers' column
describe **scope**, never **quantity**."

**Three of the four were right on the day, which is the part worth writing down.** Only `commands/`
had drifted. A rule violated four times and visibly wrong once reads as a single stale figure to
correct rather than as four copies to delete, and correcting the one is what leaves the other three
to drift later.

**The membership list under it was short by one, and by a spec this same programme added.** The tree
listed 56 command files; `comm -3` against disk named exactly one absentee,
`compile-no-skills-refusal.e2e.test.ts` - the spec written for the `compile` refusal that named a
command exiting 127, which every existing spec had missed because they matched the message's lead-in
rather than asking whether the command it hands out exists. The count and the list drifted together
and in the same direction, so neither could contradict the other.

```
comm -3 \
  <(sed -n '/^  commands\//,/^  interactive\//p' .ai-docs/reference/testing/e2e-infrastructure.md \
      | grep -oE '^\s+[a-z0-9.-]+\.e2e\.test\.ts' | tr -d ' ' | sort -u) \
  <(ls e2e/commands/ | grep -E '\.e2e\.test\.ts$' | sort -u)
```

## Fix Applied

All four annotations deleted, keeping the descriptive scope text; the missing row added in
alphabetical position with a one-clause description matching its neighbours. The `comm` above now
returns empty in both directions.

## Proposed Standard

1. **`documentation-bible.md` -> A Count Lives in Exactly One Document: replace "totals" with a
   sentence that reaches the slices.** A count the owning document expresses as an aggregate is
   still owned when another document expresses it per-directory, per-category or per-scope; the
   owning doc is decided by the SUBJECT, not by the granularity. As written, the table's "Source-file
   and E2E-file totals" row is read as a rule about two specific numbers rather than about the
   quantity of files, and four annotations sat outside it for that reason alone.

2. **Register the command-spec listing in `scripts/check-enumeration-drift.ts`.** The list is a
   directory listing rather than a symbol's exports, and the bible already records that shape as one
   the registry cannot express (`SourceEnumeration` is a file plus a symbol, with no directory
   form) - so this is a request for the directory form, not a row that can be added today. Until it
   exists, a spec added to `e2e/commands/` updates no document by any mechanism: the doc-touching
   hook table routes test-infrastructure changes by `e2e/pages/` and `e2e/helpers/`, and a new spec
   file touches neither.
