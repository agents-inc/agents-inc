---
type: standard-gap
severity: low
affected_files:
  - vitest.setup.ts
  - src/cli/consts.ts
  - src/cli/lib/__tests__/helpers/e2e-runner-doors.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: shared
root_cause: enforcement-gap
status: partial
partial_note: >-
  vitest.setup.ts deletes AGENTS_INC_EDITOR_URL. Nothing holds the unit setup against the
  module-load reads in NAMED_ENV_READS, so the next such read can repeat this.
---

## What Was Wrong

`EDITOR_URL` reads `AGENTS_INC_EDITOR_URL` once, at module load. The variable was added to
`NAMED_ENV_READS` and cleared at all three e2e spawn doors, and the rosters spec held that. The unit
suite runs in-process, though, and `vitest.setup.ts` pins only `AGENTS_INC_API_URL`, the other
module-load read. With the variable exported, unit specs that assert a printed editor link went red:
`AGENTS_INC_EDITOR_URL=http://localhost:5173/editor npx vitest run src/cli/utils/messages.test.ts
src/cli/lib/__tests__/commands/share.test.ts src/cli/consts.test.ts` gave `Tests 4 failed`. The
developer who would set the override is the one it hits.

`e2e-runner-rosters-match-the-tree.test.ts` covers spawn doors only. No check covers the unit setup.

## Fix Applied

`delete process.env.AGENTS_INC_EDITOR_URL` beside the API pin in `vitest.setup.ts`. With the
variable exported, the same command gives 89 passed. So do the 10 files from
`grep -rln 'agentsinc.sh/editor' src scripts --include='*.test.ts' --include='*.test.tsx'`
(339 tests).

## Proposed Standard

`.ai-docs/standards/e2e/README.md`, in the paragraph on telling a spawned binary about every
variable the product reads: a variable the product reads at MODULE LOAD must also be pinned or
deleted in `vitest.setup.ts`, because a spec cannot stub it after the import. A spec could hold
the setup against the module-load reads in `NAMED_ENV_READS`, but it would first have to tell a
module-load read from a call-time one. Not built. No conflict with existing rules found.
