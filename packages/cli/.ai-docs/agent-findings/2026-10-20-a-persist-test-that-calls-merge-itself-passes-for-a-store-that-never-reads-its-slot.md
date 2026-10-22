---
type: anti-pattern
severity: low
affected_files:
  - apps/editor/src/stores/ui-store.test.ts
  - apps/editor/src/stores/saved-stack-store.test.ts
standards_docs:
  - .ai-docs/standards/e2e/test-structure.md
date: 2026-10-20
reporting_agent: web-tester
category: testing
domain: web
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  Both files now assert through the slot. ui-store.test.ts seeds `agents-inc:ui:v1` before the
  import and reads `getState()`, or acts and reads what was written; saved-stack-store.test.ts saves
  and reads the keys written. No `persist.getOptions()` is left in apps/ or packages/.
---

## What Was Wrong

Seven tests in `ui-store.test.ts` and one in `saved-stack-store.test.ts` read zustand's
`store.persist.getOptions()`. They checked `name`, `version` and `typeof partialize/merge`, or
called `merge!(blob, getInitialState())` and `partialize!(state)` themselves. That pins the
middleware's configuration, not what a visitor gets back. Census: `git show HEAD:<file> | grep -n
getOptions` gives 7 hits in the first file and 1 in the second. The same grep over `apps packages`
after the fix gives 0.

The gap was checked. `skipHydration: true` was added to `ui-store.ts`'s persist options in place,
then reverted, so the store never restored a visitor's arrangement. Against that, the HEAD test
file ran `33 passed (33)`. The rewritten file failed on `keeps a blob written before the two new
keys existed` and `falls back one field at a time rather than discarding the blob`.

## Fix Applied

Each test was rewritten to go through the stubbed `window.localStorage`. The merge cases seed the
slot at version 3 and read the hydrated `getState()`. The partialize, version and slot-name cases
act, then read the slot written. Four probes were applied in place and reverted, and each turned
the rewritten tests red: renamed slot, version 4, a leaked `skillsCollapsed`, and a merge that
refuses all.

## Proposed Standard

`apps/editor`'s store tests: a persisted store is asserted through the storage it writes and
reads, never through `persist.getOptions()`. This does not conflict with `CLAUDE.md`. It is the
owner's 2026-08-26 refactor-survival ruling applied to zustand.
