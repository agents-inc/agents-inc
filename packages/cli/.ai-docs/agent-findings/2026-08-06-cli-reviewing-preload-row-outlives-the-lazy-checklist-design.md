---
type: convention-drift
severity: low
affected_files:
  - packages/matrix/src/read-model/preload-defaults.ts
standards_docs:
  - .ai-docs/reference/features/agent-system.md
date: 2026-08-06
reporting_agent: general-purpose
category: architecture
domain: shared
root_cause: scope-discipline-deferred
status: resolved
resolved_by: >-
  The reviewer-column thinning pass (2026-08-06) removed
  `"meta-reviewing-cli-reviewing": ["reviewer"]` from `PRELOAD_DEFAULTS`, so all five domain
  reviewing checklists are now lazy by absence. Pinned in
  `packages/matrix/src/read-model/preload-defaults.test.ts` ("holds no entry for the domain
  reviewing checklists", which now lists all five) and in `assignment-defaults.test.ts`, whose
  `DOMAIN_REVIEWING_SKILLS` list drives both the reach and the load assertions.
---

## What Was Wrong

The reviewer consolidation's loading design says the domain reviewing checklists are LAZY on the
consolidated `reviewer` — listed in its activation protocol, loaded per diff. The four new skills
(`meta-reviewing-web/api/ai/infra-reviewing`) follow it: no `PRELOAD_DEFAULTS` row, lazy by
absence. But `meta-reviewing-cli-reviewing` predates the design and still carries its row
(`["reviewer"]`), so the CLI checklist alone arrives PRELOADED on the reviewer while its four
siblings arrive lazy. One category, two loading behaviours, distinguished only by authorship date.

The row was deliberately left in place: the consolidation brief ruled "do not thin the rest of the
reviewer column — that is a separate follow-up pass", and deleting the row is exactly a
reviewer-column thinning. (The default stacks were NOT left inconsistent: the merged stack blocks
already carry `meta-reviewing-cli-reviewing` without a `preloaded` flag, per the same brief.)

## Fix Applied

The row is gone. The reviewer-column thinning pass took it out alongside the other 45 rows the
owner's ruling demoted, so all five domain checklists are lazy by absence and the category has one
loading behaviour again. The pass also narrowed the reviewer's eager column to the frameworks and
`meta-reviewing-reviewing`, which is the design this row was the last survivor of.

## Proposed Standard

When a loading-design ruling covers a CATEGORY of skills ("domain reviewing checklists are lazy"),
sweep the category's existing `PRELOAD_DEFAULTS` rows in the same change or record the survivors —
a design that only applies to members added after it is a drift generator. Candidate home:
`.ai-docs/reference/features/agent-system.md`, next to the reviewer consolidation note.
