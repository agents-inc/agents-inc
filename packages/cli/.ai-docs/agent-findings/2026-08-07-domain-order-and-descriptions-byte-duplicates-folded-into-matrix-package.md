---
type: convention-drift
severity: low
affected_files:
  - src/cli/consts.ts
  - src/cli/components/wizard/utils.ts
  - src/cli/lib/wizard/domain-order.ts
  - src/cli/components/wizard/domain-selection.tsx
  - ../matrix/src/read-model/domains.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-07
reporting_agent: general-purpose
category: dry
domain: shared
root_cause: scope-discipline-deferred
status: resolved
resolved_by: EDITOR-11 step 2 — the CLI now imports DOMAIN_ORDER and DOMAIN_DESCRIPTIONS from @workspace/matrix; its byte-duplicates (BUILT_IN_DOMAIN_ORDER in consts.ts, BUILT_IN_DOMAIN_DESCRIPTIONS in components/wizard/utils.ts) are deleted.
---

## What Was Wrong

`packages/matrix/src/read-model/domains.ts` carried byte-for-byte copies of two
CLI constants — the nine-domain display order (`BUILT_IN_DOMAIN_ORDER` in
`src/cli/consts.ts`) and the domain descriptions
(`BUILT_IN_DOMAIN_DESCRIPTIONS` in `src/cli/components/wizard/utils.ts`) — with
an in-code comment admitting they were "kept in sync by hand". Nothing checked
the sync; agreement was luck. The original excuse (importing them would have
pulled the CLI's whole consts module across the repository boundary) expired
when D-239 made `@workspace/matrix` a bundled dev-dependency of the CLI.

## Fix Applied

The matrix package's `DOMAIN_ORDER` / `DOMAIN_DESCRIPTIONS` are now the single
source. The CLI's copies are deleted; `domain-order.ts`,
`domain-selection.tsx` and the tests that named the old constants import the
shared ones. `DOMAIN_LABELS` ("Infra") and the CLI's `DOMAIN_DISPLAY_NAMES`
("Infrastructure") were left alone — they differ on purpose and were never
duplicates.

## Proposed Standard

When a value must agree across `packages/cli` and a web surface, it lives in
`packages/matrix` and the CLI imports it — the bundling precedent (tsup
`noExternal`) makes "it would drag Node-only code across the boundary" a dead
argument for hand-synced copies. Candidate home:
`.ai-docs/standards/clean-code-standards.md`, beside the existing
single-definition rules.
