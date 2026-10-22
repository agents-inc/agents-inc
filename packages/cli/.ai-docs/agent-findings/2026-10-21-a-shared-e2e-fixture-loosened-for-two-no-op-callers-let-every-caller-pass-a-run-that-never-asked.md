---
type: anti-pattern
severity: medium
affected_files:
  - e2e/fixtures/e2e-stack-seed.ts
  - e2e/lifecycle/preloaded-preservation.e2e.test.ts
  - e2e/lifecycle/re-edit-cycles.e2e.test.ts
  - e2e/lifecycle/scope-change-deselect-integrity.e2e.test.ts
  - e2e/lifecycle/scope-toggle-roundtrip.e2e.test.ts
  - e2e/lifecycle/tombstone-cleanup-PtoG-restoration.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: missing-rule
status: resolved
resolved_by: >-
  applyEditFrom waits for the question again and confirms it. The no-op calls use
  applyUnchangedFromSeed, which asserts the run said "No changes made", exited 0 and never asked.
---

## What Was Wrong

When a true no-op `edit --from` stopped asking, `applyEditFrom` was changed to wait for the
question or the exit, and to confirm only if the question appeared. Every caller then accepted a
run that applied without asking. Callers: `grep -rn 'applyEditFrom(\|applyFromSeed(' e2e`.

The review that found this named the two `Unchanged1` calls as the only no-ops. Making the fixture
strict again and running the whole e2e suite found seven no-op calls across five spec files:
`scope-change-deselect-integrity`, `scope-toggle-roundtrip`, `preloaded-preservation`,
`re-edit-cycles` (two in one spec, one in another) and `tombstone-cleanup-PtoG-restoration`
Scenario C. A loosened fixture also hides which callers depend on the loosening. Only the strict
version's red run lists them.

## Fix Applied

`applyEditFrom` is strict again. The no-op path is its own helper, `applyUnchangedFromSeed`, and it
asserts the no-op it exists for.

## Proposed Standard

`.ai-docs/standards/e2e/README.md`: when a behaviour change leaves some callers of a shared fixture
on a different path, give those callers their own helper that asserts the new path. Do not widen the
fixture to accept both, because then every caller accepts both.
