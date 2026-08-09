---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/configuration/skill-audit.ts
  - src/cli/lib/matrix/matrix-health-check.ts
  - src/cli/lib/configuration/__tests__/skill-audit.test.ts
  - todo/plans/CLI-389-phase0-worksheet.md
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Code landed — the manifest, both enforcement points and the consistency test all ship, with the
  pre-apply gap enumerated in `auditVerdictsPendingApply` and pinned exactly by test. Pending: the
  worksheet §4 skeleton still describes the two checks as if the tree were synchronised, and no
  standard says an audit manifest must state its own apply-time assumption.
---

## What Was Wrong

The CLI-389 worksheet §4 skeleton specifies two enforcement points over the audit manifest:

- **compile time** — `Record<SkillId, SkillAuditEntry>` makes a missing skill a `tsc` error;
- **runtime** — a `universal` verdict on a skill that carries `requires` or sits in an exclusive
  category "is a contradiction and must fail".

Both are correct, and both silently assume the manifest and the rules describe the _same_ tree.
They do not. Nine of the twelve batches record **post-apply** verdicts — B9 and B10 say so in
their own words ("All verdicts are post-apply, i.e. they assume the derived-requires lands") — so
a verdict is a claim about the catalog _after_ that batch's category disposition lands, while
`default-categories.ts` and `default-rules.ts` still describe the catalog before it.

Measured against the live `BUILT_IN_MATRIX`, the manifest's 237 rows diverge on exactly 12:

| direction                    | count | rows                                       | owed to                            |
| ---------------------------- | ----- | ------------------------------------------ | ---------------------------------- |
| `constrained` not yet backed | 2     | playwright-e2e, cypress-e2e                | B4's `web-e2e` split               |
| `constrained` not yet backed | 9     | the 4 vector-db, 2 search and 3 cms skills | B7's three `exclusive: true` flips |
| `universal` still fenced     | 1     | sse                                        | B4's `web-streaming` split         |

Nothing here is a transcription error — every one of the twelve is traceable to a category
disposition the batch recorded and the apply waves have not yet landed. But with no vocabulary for
"recorded ahead of its mechanism", the manifest could only be landed three ways, and two of them
are worse than the problem:

1. **weaken the verdicts to match today's tree** — this makes the audit trail lie, the exact
   failure B9 named when it refused to record class B for maestro and tamagui;
2. **ship the checks failing** — a red gate and, because `checkMatrixHealth` runs on every source
   load through `source-loader.ts`, a user-visible `Warning:` line on every CLI invocation for a
   migration that is already decided;
3. state the assumption as data — what landed.

The general gap: an audit manifest is a dated claim about a moving tree, and nothing in the
skeleton or the standards required it to say _which_ tree it was audited against.

## Fix Applied

`auditVerdictsPendingApply` sits beside `skillAudit` in `skill-audit.ts` — a
`Partial<Record<SkillId, string>>` naming each of the twelve rows and the batch that owns the
unlanded change. Both enforcement points skip exactly these rows and nothing else, so any other
divergence between the manifest and the rules still fails immediately.

The exemption cannot rot in either direction. `skill-audit.test.ts` asserts the set matches the
live gap **exactly** (`toStrictEqual`), so a stale entry fails as loudly as a missing one: when
B4's or B7's disposition lands, the corresponding entries must be deleted or the suite goes red.
A second test requires each value to name its batch (`/^B\d+ — pending /`), so the record cannot
decay into an unattributed allow-list.

Also landed, and worth naming because two surfaces must agree on it: `isFencedByMatrix` is
exported from `matrix-health-check.ts` as the single definition of "this skill is fenced". The
runtime contradiction check and the consistency test both call it. Two private copies of that
predicate could disagree, and the check and the test disagreeing is precisely the failure the
manifest exists to prevent.

## Proposed Standard

Two rules, both belonging in the CLI-389 plan's own §4 and then in
`.ai-docs/standards/` alongside whatever documents the manifest:

1. **A verdict manifest must state the tree it was audited against.** Where verdicts are recorded
   ahead of the mechanism that backs them, the divergence is enumerated as data with per-row
   attribution to the change that closes it — never absorbed into the verdicts themselves, and
   never left as a failing gate. "Weaken the verdict to match today's tree" is the anti-pattern;
   it converts a scheduling fact into a false audit record.

2. **An exemption set must be pinned by exact match, not by containment.** `toStrictEqual` against
   the live gap is what makes the set self-emptying. An `expect(gap).toEqual(expect.arrayContaining(...))`
   or a `.filter(id => !exempt[id])` with no reverse assertion lets exemptions outlive their
   cause, which is how allow-lists become permanent.

Worth deciding separately (out of scope here): the runtime `skill-unaudited` warning fires for
every source-provided skill that has no manifest entry, which is the correct signal inside
`source-validator.ts` Phase 3 but is unconditional noise for anyone running a third-party source
day to day. Local skills are already excluded. If that proves noisy, the fix is a severity filter
at the `source-loader.ts` call site, not a narrower check.
