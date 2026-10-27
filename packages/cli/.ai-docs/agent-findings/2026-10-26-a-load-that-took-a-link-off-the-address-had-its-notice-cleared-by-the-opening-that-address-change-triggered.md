---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/src/features/configure/lib/use-catalog-first.ts
  - apps/editor/src/features/configure/lib/use-marketplace-load.ts
standards_docs:
  - packages/cli/.ai-docs/standards/editor-and-worker.md
date: 2026-10-26
reporting_agent: web-developer
category: architecture
domain: web
root_cause: missing-rule
status: partial
partial_note: >-
  The instance is fixed (EDITOR-114): the effect skips the bare address's opening when a load
  leaving a link already did it. The proposed rule in editor-and-worker.md is not written.
---

## What Was Wrong

Two parties opened this browser's own configuration when a Marketplace load, a switch or a saved
stack left a shared link. `useOpenOwnConfiguration` read the saved configuration, said which ids its
catalogue could not place, then took `fromId` off the address. That address change re-ran
`useCatalogFirst`'s effect, which is keyed on `fromId` and treats every change as a fresh opening:
it cleared the notice, then opened the own configuration again. `readSavedConfig` answers `[]` for a
slot already open, so the notice ended empty. A saved stack's notice, said after the leave, was
cleared the same way. The Editor nav item worked only because nothing opened ahead of the effect
there.

Census of address changes in the editor, 2026-10-26, from `apps/editor`:
`grep -rn "navigate(" src | grep -v "\.test\."`. It returns 3 sites. `filter-bar.tsx` and
`releaseSelectedOnly` (`use-apply-stack-request.ts`) change `q`, the domain and `sel`, which are read
during render or scrolled to by `use-domain-scroll.ts` as intended. The third took `fromId` off the
address, the only key an opening effect reads.

## Fix Applied

Leaving a link moved into `use-catalog-first.ts` as `useLeaveTheLink`. It sets a one-shot marker
before it navigates. The effect takes that marker on every opening, and skips only the bare address's
opening when the marker was set. A marker set by a stale closure, whose address had already moved
on, is taken by the next opening and cannot skip a link. `leaving-a-shared-link.spec.ts` pins all
three routes.

## Proposed Standard

`editor-and-worker.md`, a new section: "A handler that does an address's work and then changes the
address says so to the effect keyed on it." An effect keyed on a search param is a second door to the
same transition. A handler that has already done the work, and said what it found, must not have it
redone or cleared by the re-run its own navigation causes. The check is a spec per route that leaves
by that handler and asserts what was said afterwards. A spec that asserts only the address passes
over this defect, because the notice is on screen for about 30 ms. This conflicts with nothing in
CLAUDE.md or the standard.
