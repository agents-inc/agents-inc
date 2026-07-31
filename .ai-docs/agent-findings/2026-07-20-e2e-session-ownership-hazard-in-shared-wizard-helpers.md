---
type: convention-drift
severity: medium
affected_files:
  - e2e/fixtures/dual-scope-helpers.ts
  - e2e/lifecycle/dual-scope-spacebar-reselect-restore.e2e.test.ts
  - e2e/interactive/edit-wizard-dual-scope-indicator.e2e.test.ts
  - e2e/lifecycle/tombstone-cleanup-PtoG-restoration.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: partial
partial_note: 'Inverted relative to the enum''s documented direction — the CODE side landed and the DOCS side did not. Landed (verified 2026-07-30): `readSkillBadgesViaEdit()` and `finishWizard()` both exist in `e2e/fixtures/dual-scope-helpers.ts` with their ownership contracts in doc comments, and `readSkillBadgesViaEdit` has since been adopted at call sites in `dual-scope-collapse-and-restore-via-s.e2e.test.ts` — the convention-A adoption the finding deferred has begun. Pending: the proposed standard. `standards/e2e/README.md` has no "Session ownership" section, so none of the four rules is written down — a future helper author still has nothing telling them a wizard-launching shared helper must own its session, nor that a helper returning wizard output must name whether it reads `rawOutput` or `output`.'
---

## What Was Wrong

Two incompatible session-cleanup conventions coexist for "open a wizard, read
rendered state, abort without saving" blocks, and nothing documents which one a
shared helper is allowed to assume.

**Convention A — helper owns the session.** The local `readReactBadges()` helper
in `dual-scope-spacebar-reselect-restore.e2e.test.ts` launches the wizard and, in
a `finally`, calls `abort()` → `waitForExit()` → `destroy()`. Cleanup is entirely
internal; the test never sees the wizard handle.

**Convention B — the test owns the session.** `edit-wizard-dual-scope-indicator`
(Scenario A, Scenario B phase 4) and `tombstone-cleanup-PtoG-restoration` (two
sites) assign the launched wizard to an outer `let wizard` that an `afterEach`
destroys. Those blocks call `abort()` + `waitForExit()` inline but deliberately
do NOT call `destroy()`.

The hazard: extracting the duplicated body into a shared helper is only safe if
the helper adopts convention A, and adopting a convention-A helper at a
convention-B call site silently leaves the outer `wizard` variable pointing at an
already-destroyed session — the `afterEach` then double-destroys. The five sites
are byte-similar enough that this reads as a pure copy-paste dedup, which is
exactly why it is easy to get wrong.

There is a second, subtler asymmetry in the same family: the finalize ritual
(`await result.exitCode` → capture output → `await result.destroy()`) reads
`result.rawOutput` at 26 of 27 sites but `result.output` at
`e2e/interactive/real-marketplace.e2e.test.ts:67`. A shared extractor that
returns `rawOutput` is not a drop-in there.

## Fix Applied

Added `readSkillBadgesViaEdit()` to `e2e/fixtures/dual-scope-helpers.ts` using
convention A (helper owns launch/abort/waitForExit/destroy), with a doc comment
stating the ownership contract explicitly: _"Owns the whole session — it
launches, aborts, waits for exit and destroys, so callers must NOT also track the
wizard for afterEach cleanup."_ The doc comment also records that the helper only
reads the first domain's grid, since a later-domain skill needs an explicit
`advanceDomain()` first.

Also added `finishWizard(result)` with a doc comment stating that `output` is
`rawOutput` specifically, and that it deliberately does not assert on the exit
code (failure-path flows return non-success codes, so the assertion must stay at
the call site).

Adoption at the spec-file call sites was deliberately NOT performed — that is a
separate sweep, and each convention-B site needs its outer `wizard` tracking
removed in the same edit.

## Proposed Standard

Add to `.ai-docs/standards/e2e/README.md` a "Session ownership" section:

1. Any shared helper in `e2e/fixtures/` or `e2e/helpers/` that launches a wizard
   MUST fully own that session — `destroy()` in a `finally` — and MUST state the
   ownership contract in its doc comment.
2. A call site adopting such a helper MUST drop its own `let wizard` tracking and
   the corresponding `afterEach` destroy for that session. Never leave both.
3. Helpers that return wizard output MUST name which accessor they read
   (`rawOutput` vs `output`) in the doc comment, because the two differ and the
   choice is invisible at the call site.
4. Shared finalize helpers MUST NOT assert exit codes; the assertion stays at the
   call site so failure-path tests can use the same helper.
