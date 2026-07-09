---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/test-infrastructure.md
  - .ai-docs/reference/testing/infrastructure.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
  - .ai-docs/reference/testing/factories.md
  - .ai-docs/reference/testing/mock-data.md
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-04-21
reporting_agent: codex-keeper
category: testing
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: reference/test-infrastructure.md converted to 27-line pointer matching the type-system.md pattern (4-row redirect table); children under reference/testing/ remain authoritative
---

## What Was Wrong

`reference/test-infrastructure.md` (783 lines, last_validated 2026-04-13) preserved a drifted monolithic body alongside four split children under `reference/testing/` (all last_validated 2026-04-21). The children carried post-split updates — dual-scope POM, `waitForStableRender`, `BaseStep` primitives contract, `test-fs-utils`/`expected-values` extraction, domain-scoped factory/helper/assertion directories — that the original body lacked. Same anti-pattern iter 41 caught in `type-system.md`.

Cross-checked the other iter-41-suggested candidates: `architecture-overview.md`, `commands.md`, `state-transitions.md`, `store-map.md`, `component-patterns.md`, and `features/wizard-flow.md` are all CURRENT AUTHORITATIVE (last_validated 2026-04-21). Their subdir counterparts (`architecture/overview.md`, `commands/index.md`, `wizard/*.md`) are explicit reverse-pointer stubs by design. No drift.

## Fix Applied

Converted `test-infrastructure.md` to a 4-row pointer matching the `type-system.md` pattern: frontmatter, "split" banner explaining inbound-link preservation, and a table mapping topics to child files. Updated DOCUMENTATION_MAP.md row with iter42 note.

## Proposed Standard

Add to documentation-bible or the reference/ validation checklist: **when splitting a monolithic reference doc into domain children, the original must be converted to a pointer in the same commit.** Leaving a preserved body behind creates a drift trap — the children get updated in subsequent passes while the original silently rots. The iter-41 and iter-42 pattern is now two-for-two: audit the remaining split originals quarterly against their children's `last_validated`.

Heuristic for future sweeps: if an original and a split-child sibling exist and `|original.last_validated - child.last_validated| > 7 days`, treat as drifted-original candidate and verify with a section-level diff before converting.
