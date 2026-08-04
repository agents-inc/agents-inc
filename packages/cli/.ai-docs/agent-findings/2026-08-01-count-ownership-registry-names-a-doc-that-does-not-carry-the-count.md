---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/reference/features/configuration.md
  - .ai-docs/reference/features/skills-and-matrix.md
  - .ai-docs/reference/architecture-overview.md
  - .ai-docs/reference/config/configuration.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-01
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: rule-not-specific-enough
status: partial
partial_note: >
  Docs side landed — the count was removed from the one pointer file in this agent's ownership
  (reference/config/configuration.md) and the mismatch recorded there. Standards side pending:
  documentation-bible.md's ownership registry still names skills-and-matrix.md as the owner of the
  defaultCategories count, which is not where the figure actually lives. This is the inverse of
  README.md's documented `partial` direction (docs landed, standards pending).
---

## What Was Wrong

`standards/documentation-bible.md` introduced the rule **"A Count Lives in Exactly One Document"**
plus an ownership registry naming, per count, the single doc that re-derives it. The rule is sound
and the registry is the right mechanism. But the registry was written by **assigning** owners
topically rather than by **checking** which doc actually carries each number — so at least one row
names a doc that does not hold the figure at all.

Registry row:

| Count                                               | Owning doc (per the registry)             |
| --------------------------------------------------- | ----------------------------------------- |
| `defaultCategories` size + exclusive/required split | `reference/features/skills-and-matrix.md` |

What is actually on disk (verified this session):

| Doc                                       | What it carries                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `reference/features/skills-and-matrix.md` | The number **only inside an HTML validation comment**, as an aside about Limitation #6                       |
| `reference/features/configuration.md`     | The authoritative write-up: "**Count: 89 definitions** ... 27 are `exclusive: true`; 6 are `required: true`" |
| `reference/architecture-overview.md`      | "`defaultCategories` — 89 category definitions" in a tree annotation                                         |
| `reference/config/configuration.md`       | "The 89 `defaultCategories` definitions" in a **redirect row** of a pointer file                             |

So the number lives on four surfaces, and the doc the registry designates as its owner is the one
place it is _not_ stated as an owned figure.

**No live drift today.** Re-derived from `src/cli/lib/configuration/default-categories.ts` this
session: 89 `id:` entries, 27 `exclusive: true`, 6 `required: true`. All four surfaces agree with
disk. That is precisely what makes this worth filing — the failure mode the rule exists to catch is
invisible while the values happen to agree, and the registry is what a future validator will trust
to decide which single doc to re-count.

The fourth surface is the worst of the four regardless of correctness: `config/configuration.md` is
a **pointer file**. Per the bible's own Pointer Freshness Rule it "contains no source-derived
claims — only a redirect table", and it has no mechanism to re-derive anything. A quantity in a
redirect row can only ever rot.

This is the same failure the bible already documents as its own worked example — `# All 39 Zod
schemas` surviving in the structure diagram from 2026-07-23 to 2026-07-30 while the true count sat
corrected in the owning doc. The rule was written; the registry that operationalises it was not
verified against disk.

## Fix Applied

Within this agent's ownership:

- Removed the count from the redirect row in `reference/config/configuration.md`. A redirect row
  now carries a TOPIC, never a QUANTITY.
- Recorded the registry-vs-reality mismatch in that file's validation comment, naming each surface
  that quotes the figure and its owner, per the bible's instruction to record cross-ownership
  mismatches in a file you do own.

Not fixed (outside ownership): `documentation-bible.md` (convention-keeper's), and the two
non-owned reference docs that quote the number.

Separately, while applying the same rule to `reference/utilities.md`, the corresponding _live_
defect was found and fixed there: the remeda-importer count had drifted 29 → 30. Exhaustive lists
in that file were re-derived rather than carried forward, which is what surfaced it.

## Proposed Standard

Three additions to `standards/documentation-bible.md` → "A Count Lives in Exactly One Document":

1. **Verify the registry against disk when adding a row.** Before naming a doc as a count's owner,
   `grep` the number across `.ai-docs/` and confirm the named doc is where it is actually stated.
   Assigning ownership topically produces a registry that reads authoritative and points nowhere.
   Every existing row should get this check once.

2. **A pointer file may never contain a number.** Make this explicit in the Pointer Freshness Rule,
   which currently says a pointer holds "a redirect table and nothing else" but does not call out
   quantities specifically — and a topic-plus-count row still looks like a redirect row.

3. **A count inside an HTML comment does not constitute ownership.** Validation comments record what
   a past pass checked; they are not the doc's claim surface. If the registry names a doc as owner,
   that doc needs the figure in its body, in a section a reader lands on — `skills-and-matrix.md`
   should either gain a "Current Counts" entry for `defaultCategories` (the registry row already
   references that section by name) or the row should be repointed at
   `features/configuration.md`, which is where the write-up genuinely lives.
