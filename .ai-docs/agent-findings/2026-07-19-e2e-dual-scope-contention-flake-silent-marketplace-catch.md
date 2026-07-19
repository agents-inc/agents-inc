---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/operations/source/ensure-marketplace.ts
  - e2e/lifecycle/dual-scope-edit-scope-changes.e2e.test.ts
  - e2e/lifecycle/dual-scope-spacebar-reselect-restore.e2e.test.ts
  - e2e/lifecycle/tombstone-cleanup-PtoG-restoration.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-19
reporting_agent: main-thread (expressive-ts refactor loop)
category: testing
domain: e2e
root_cause: enforcement-gap
---

# Dual-scope E2E suites flake under full-suite contention; one mechanism is ensureMarketplace's silent catch

## What was observed

Across three full-E2E boundary runs during the expressive-TypeScript refactor (all on
builds whose failing tests pass solo, repeatedly):

- Run 1: `dual-scope-edit-scope-changes` › G→P toggle failed (project skill dir never
  created). Passed 4/4 in three consecutive solo runs of the same build.
- Run 2: fully green (521/521).
- Run 3: `dual-scope-spacebar-reselect-restore` (2 tests) and
  `tombstone-cleanup-PtoG-restoration` › Scenario B failed. All 5 tests across both
  files pass solo on the same build.

The failing set MOVES between runs while solo runs are deterministically green —
classic worker-contention flake (~21 vitest workers, PTY-driven tests, 30s waits).

## An identified mechanism

Run 3's screen capture shows the edit flow dying on the plugin hard-error:
"Cannot install or uninstall plugin skills: marketplace could not be resolved from
source '/tmp/ai-e2e-…/source'".

`ensureMarketplace` resolves a missing marketplace name via
`fetchMarketplace(...)` inside a `try { … } catch { return { marketplace: null, registered: false } }`.
Under heavy IO contention the fetch against the temp local source can fail
transiently; the catch swallows the cause, returns `marketplace: null`, and the
(correct, inviolable) hard-error policy turns a transient IO hiccup into a
user-facing fatal error — and a test flake. The same silent-catch shape exists for
the G→P copy path timings.

## Why it matters

- Full-suite E2E results are not trustworthy as a red/green gate right now: a red
  full run requires solo re-runs to classify. This taxes every boundary gate.
- The silent catch is also a real UX issue: a user on a slow disk/network can get
  the hard-error with no hint the failure was transient.

## Suggested direction (not applied — test/product policy is the owner's call)

1. `ensureMarketplace`: log the caught error at `verbose`/`warn` before returning
   `marketplace: null`, so transient causes are diagnosable in E2E captures and by users.
2. Consider a single retry for the local-source `fetchMarketplace` path.
3. E2E: either cap worker count for the `dual-scope-*`/`tombstone-*` lifecycle suites
   or route them through the existing INTERNAL_RETRIES mechanism.

## 2026-07-19 update — worker-cap experiments and refined root cause

Worker-count reduction was tested at the owner's request and does NOT eliminate
the flake (it only lowers the probability):

- `maxWorkers: 16`: run 1 fully green (521/521, 309s); run 2 failed 1/521.
- `maxWorkers: 12`: failed 1/521 (367s — slower AND still flaky).
- Uncapped (~21): historical boundary runs alternate green/1-3 failures.

The 12-worker failure captured the full screen and pins the PRIMARY mechanism
one level deeper than the silent catch:

1. `dual-scope-spacebar-reselect-restore` drives `s`/space on the FIRST-FOCUSED
   grid cell after a blind 500ms `FOCUS_EFFECT_FLUSH_MS` delay. Under load the
   keystroke acted on the WRONG cell: the change summary showed
   `+ Vue Composition Api [G]` / `- web-framework-react [P]` — Framework is an
   exclusive category, so toggling Vue on kicks react off.
2. The newly-added Vue had no saved source, so the sources step defaulted it to
   the public plugin source (`saved?.source ?? primarySource ?? DEFAULT_PUBLIC_SOURCE_NAME`);
   the driver does not call `setAllLocal`.
3. Plugin install mode then hit the (correct) hard-error: the local E2E source
   has no marketplace. The silent `ensureMarketplace` catch shapes the message
   but is NOT the root cause in this capture — the plugin path itself was
   entered by mistake.

So the flake class is the async `focusedSkillId` seeding race — the documented
"TODO: Fix A" in `e2e/pages/steps/build-step.ts`: `CategoryGrid` seeds
`focusedSkillId` in a post-mount `useEffect`, and `wizard.tsx`'s HOTKEY_SCOPE
handler reads it; the 500ms blind delay is insufficient under contention.

## Updated suggested direction (owner's call — product change in D-233 territory)

1. **Fix A (root cause)**: seed `focusedSkillId` synchronously in
   `hydrateWizardStore` (or first render) so the first-focused cell is
   deterministic before any input can land; delete `FOCUS_EFFECT_FLUSH_MS`.
2. Keep the earlier suggestions (verbose-log the ensureMarketplace catch; a
   retry for local-source fetchMarketplace) as diagnosability hardening.
3. `maxWorkers: 16` is retained in e2e/vitest.config.ts as a palliative (cost
   ≈ zero: 309s vs 295s uncapped) — it is NOT a fix.

## 2026-07-19 update 2 — Fix A landed; closed-loop keypress retry tried and REVERTED

**Fix A (synchronous `focusedSkillId` seeding) is implemented and kept**:
`seedFocusedSkillForActiveDomain` in wizard-store, wired at hydrate (both flows),
`setStep("build")`, and all domain transitions; the CategoryGrid post-mount seed
effect and the E2E `FOCUS_EFFECT_FLUSH_MS` blind delay were deleted. This killed
the wrong-target signature (the `+ Vue / - react` capture) and improved full-suite
stability at 16 workers from ~1-in-2 red to ~1-in-3/4 red.

**The residual mechanism** is the OTHER race: Ink attaches `useInput` in an
effect AFTER the first paint, so a bare `s`/space sent right after
`waitForStableRender` can be swallowed under load (the deleted 500ms delay had
been masking this window).

**Closed-loop keypress retry was tried and REVERTED — do not re-attempt it**:
`s`/space are toggles, so a re-press after a landed-but-not-yet-verified press
REVERTS the state. Under 16-worker load, renders can lag past a 3s verification
window and mid-repaint torn frames can make the badge row momentarily unreadable,
so the retry misfires. Empirical result: 3 of 4 full runs red (worse than the
1-of-4 baseline), failures concentrated exactly at the retried sites. The suite
is intentionally back to single-press drivers + Fix A + `maxWorkers: 16`
(current steady state: green most runs, occasional 1-2 dual-scope failures that
always pass solo).

## Remaining root-cause fix (proposed, NOT implemented — owner deferred)

Gate the wizard footer sentinel on input-readiness: render the footer hint (the
`"select"` text every E2E wait keys on) only after an `inputReady` flag set in a
mount effect. `waitForStableRender` then doubles as an input-readiness barrier,
single presses become reliable by construction, and no retry heuristics are
needed anywhere. Small product change in wizard rendering; revisit when desired.
