---
type: anti-pattern
severity: high
affected_files:
  - e2e/pages/steps/build-step.ts
  - e2e/helpers/test-utils.ts
  - e2e/pages/constants.ts
standards_docs:
  - .ai-docs/standards/e2e/page-objects.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-29
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: resolved
resolved_by: build-step.ts rewritten to closed-loop Tab-walk (this change); createPermissionsFile made merging; WIZARD_LOAD raised to 45s
---

## What Was Wrong

`BuildStep.focusSkill`/`selectSkill` dead-reckoned grid coordinates with a
wrong model of the real grid (QA sweep 2026-07-29, hit by 4 agents): it
assumed arrow-DOWN resets the column to 0, but `useFocusedListItem` PRESERVES
and clamps it (`finalCol = min(currentCol, newColCount - 1)`). A second
`focusSkill` in the same domain therefore started its RIGHT presses from a
wrong column and, with cyclic wrap, landed on — and toggled — the WRONG skill.

Two empirical facts discovered while fixing (both differ from the QA report's
framing and were previously undocumented):

1. **Cell focus is text-UNOBSERVABLE under `NO_COLOR`.** `SkillTag`
   distinguishes the focused cell only via `borderColor`/`borderDimColor`;
   with the harness's `NO_COLOR=1` the rendered frame is byte-identical
   before and after an arrow-RIGHT (verified by frame capture). "Read the
   focused cell from the screen" is impossible at cell granularity.
   **Category (row) focus IS observable**: the focused header paints as a
   single background-highlighted text with one extra leading space
   (`  Framework * (1 of 1)` vs ` Client State Management (1 of 1)`).
2. **Horizontal navigation does NOT skip disabled/incompatible cells** in the
   build grid — `CategoryGrid.findValidCol` is a plain cyclic
   `wrapOptionIndex`. (The QA report claimed it skips; the wrong-skill
   failures are fully explained by the DOWN-clamp mis-model alone.
   Incompatible skills that are unreachable are FILTERED OUT of the row by
   `useFrameworkFiltering`, so screen parse and navigation always agree.)

Additionally: `createPermissionsFile` overwrote `.claude/settings.json`
wholesale, wiping `enabledPlugins`/`extraKnownMarketplaces` when re-run
mid-lifecycle; and `TIMEOUTS.WIZARD_LOAD` (15s) was too short for init
against a real marketplace under parallel load.

## Fix Applied

- `focusSkill` is now closed-loop: it Tab-walks the category focus —
  re-reading the viewport after every press and identifying the focused
  category by its one-space-deeper header — until the category containing the
  target skill is focused. Tab (unlike DOWN) deterministically resets the
  column to 0 (`use-category-grid-input.ts` does `setFocused(nextSection, 0)`),
  so the subsequent RIGHT presses start from a screen-verified `(row, 0)`.
  Bounded attempts (`MAX_FOCUS_ATTEMPTS = 30`) with a screen-dumping error on
  exhaustion. Swallowed keystrokes self-correct (Tab wraps; each iteration is
  an anchored new-frame wait + re-read). The only residual open-loop spot is
  a single-category grid with multiple cells (Tab is a guarded no-op there
  and cell focus has no signal) — it falls back to a tracked column with the
  grid's real wrap arithmetic; single-category domains in the standard E2E
  source are all single-cell, so the fallback is effectively unreachable.
- `createPermissionsFile` now merges: preserves every existing field, only
  ensures `permissions.allow` contains `"Read(*)"`, leaves an
  already-granting file byte-identical, hard-errors on invalid JSON.
- `TIMEOUTS.WIZARD_LOAD` 15s → 45s, comment aligned with WIZARD_TRANSITION's
  parallel-load rationale. No test asserts the literal. (Note: BaseStep's
  `defaultTimeout` derives from WIZARD_LOAD, so all default step waits are
  now 45s upper bounds.)

## Proposed Standard

For `.ai-docs/standards/e2e/anti-patterns.md` (new section "No Dead-Reckoned
Grid Navigation"):

- Page-object navigation on the build grid MUST be closed-loop at category
  granularity: verify the focused category from the rendered screen (the
  extra-leading-space header) after every focus-moving keystroke; never
  maintain a keystroke-count model of the grid position across calls.
- Document the observability constraint: under `NO_COLOR` the focused CELL
  has no text signal — any design requiring cell-level verification must be
  redesigned around Tab's column-reset semantics instead.
- Document Tab vs DOWN semantics: Tab = next category + column reset to 0;
  DOWN = next category + column preserved/clamped. Only Tab yields a known
  column.

Also: `.ai-docs/standards/e2e/README.md` Constants Quick-Reference updated to
`WIZARD_LOAD` (45s) in this change; `reference/testing/e2e-infrastructure.md`
still lists the old 15s value and the old focusSkill description (left to the
doc-validation loop). `CLAUDE.md`'s keypress-rule note still says a footer
mismatch "hangs for the full 15s timeout" — now 45s (not edited here:
sub-agents must not modify CLAUDE.md).
