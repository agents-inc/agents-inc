---
type: convention-drift
severity: low
affected_files:
  - apps/editor/src/stores/config-store.test.ts
  - packages/cli/.ai-docs/standards/editor-and-worker.md
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-24
reporting_agent: web-tester
category: testing
domain: web
root_cause: premise-expired
status: resolved
resolved_by: >-
  `editor-and-worker.md` › "Under `persist`, `set` IS the write" now says to assert both, the state
  the same object and the slot unwritten, except for a store with no slot or a guard at the storage
  door, and to prove each spec against its own guard (owner accepted
  `s-editor-persist-write-assert-both`, 2026-10-24). The guard specs in `config-store.test.ts`
  (catalogue refusals, `setAgentOption`, the Codex move, `pruneToCatalog`) and the refused save in
  `saved-stack-store.test.ts` check both beside a control, and each failed with its guard removed in
  an out-of-tree vitest config. "writes nothing for an option set on a skill it cannot place" had gone
  vacuous once `setSkillOption`'s in-effect check came first: it pressed the scope a fresh entry
  already has, and stayed green with the catalogue guard removed. It now presses another.
---

## What Was Wrong

`editor-and-worker.md` -> "Under `persist`, `set` IS the write" says **"Assert state identity, not
storage"**, and gives its reason: identity "runs in the node environment that suite uses, where there
is no `localStorage` to watch."

`config-store.test.ts` answers that reason. `storeOnAWatchedSlot` stubs `window.localStorage`,
re-imports the store and counts writes to the slot, and the guard specs written after it prove "no
write" by storage alone: `describe("setAgentOption")` and `describe("an action the catalogue
refuses")`. Only `describe("pruneToCatalog")` asserts identity. So the standard tells a tester one
thing and the spec a brief points them at shows the other.

The two proofs are not the same claim. A watched slot proves nothing reached storage; identity proves
`set` was never called, which is where the standard puts the guard ("in the action, not at either
door"). A fix that skipped equal writes in the storage adapter would pass a storage-only spec and
leave `set` firing.

Reproduce:

```
grep -n 'storeOnAWatchedSlot()\|toBe(before)' apps/editor/src/stores/config-store.test.ts
```

## Fix Applied

None to existing specs. The new `describe("setSkillOption")` specs assert both: the slot unwritten,
and `store.getState()` the same object as before the press.

## Proposed Standard

Delete "not storage" and the node-environment reason from that paragraph of `editor-and-worker.md`.
A "writes nothing" spec asserts identity, and it may watch the slot as well through
`storeOnAWatchedSlot`. This is a proposal: whether the existing storage-only specs gain an identity
assertion is for whoever owns that file.
