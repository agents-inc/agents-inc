---
type: anti-pattern
severity: high
affected_files:
  - apps/editor/src/stores/config-store.ts
  - apps/editor/src/stores/config-store.test.ts
  - apps/editor/e2e/specs/catalog-first.spec.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-22
reporting_agent: web-developer
category: architecture
domain: web
root_cause: enforcement-gap
status: partial
partial_note: >-
  Code half landed: `useConfigStore` starts on `UNWRITTEN_SLOT`, and only `readSavedConfig` switches
  writes on, to the slot it is about to read. Standards half pending: editor-and-worker.md's
  corollary still says nothing covers a write while a restore is parked, and its `skipHydration`
  rule does not say such a store starts on a storage that cannot write.
---

## What Was Wrong

zustand 5.0.14's `persist` (`persistImpl`, `node_modules/zustand/esm/middleware.mjs`) wraps both the
creator's `set` and `api.setState` as "set, then `setItem()`", and nothing in that wrapper asks
whether the store has hydrated. So a store with `skipHydration` writes before it has read.

The editor's config store sets `skipHydration` and reads only through `readSavedConfig`, once its
catalogue is seated. As committed at `5f935f76`, it started on its writing storage
(`storage: OWN_SLOT`) with one slot, `agents-inc:config:v1`. So a pick made before the read was written over the saved configuration that
the read was about to restore. The reproduced case is a pick on the stand-in public catalogue while
a restore waits parked behind the Marketplace dialog. `editor-and-worker.md`'s corollary had named
this window ("nothing may write the config slot between a parked restore and the read that finishes
it") and said nothing enforced it.

With one slot per marketplace, the same write lands in the public catalogue's slot instead, because
the persist `name` stays `agents-inc:config:v1` until a read opens another.

The class is the `skipHydration` stores only. A store that hydrates at import reads localStorage
synchronously at creation (`toThenable` in the same file), before any action can run. Census,
2026-10-23: `grep -rln 'skipHydration' apps/editor/src --include='*.ts' --include='*.tsx' | grep -v
'\.test\.'` returns `apps/editor/src/stores/config-store.ts` alone. It is one of the four that
`grep -rln 'persist(' apps/editor/src/stores --include='*.ts' | grep -v '\.test\.'` returns.

## Fix Applied

From the E2b build lane, 2026-10-22, re-derived against the tree on 2026-10-23. The store starts on
`UNWRITTEN_SLOT`, which is `withoutWrites(OWN_SLOT)`. `readSavedConfig` clears memory while writes
are still off (`clearBeforeReading`). It then switches writes on in `openTheSlotOf`, to the seated
marketplace's slot, immediately before it rehydrates that slot. Of the three
`persist.setOptions` calls in `config-store.ts`, only `openTheSlotOf`'s passes a storage that
writes.

Both pins were re-derived without writing the tree. `storage: UNWRITTEN_SLOT,` was served as
`storage: OWN_SLOT,` through a Vite transform in out-of-tree vitest and Vite configs, the method in
`2026-10-21-a-mutant-only-playwright-reaches-can-be-served-to-the-dev-server-without-writing-the-shared-tree`.
A log line showed the mutant was served.

- `config-store.test.ts` › "a saved configuration per marketplace" › "writes nothing before a slot
  has been read": `expected [ Array(1) ] to strictly equal []`, 1 failed | 132 passed. The control
  without the mutant gave 133 passed.
- `catalog-first.spec.ts` › "a saved marketplace that no longer loads" › "keeps the saved picks
  through a pick made while it waits": red at `expect(await configure.storedConfig()).toBe(publicSaved)`,
  because the public slot now held `web-framework-react`. Result: 1 failed, 11 passed; the control
  gave 12 passed. The spec's marketplace-slot assertion stays green under the mutant. Before the
  fix lane seeded a public saved configuration and asserted it unchanged, this spec passed under
  the same mutant (26 passed, as the lane's review reported).

## Proposed Standard

`editor-and-worker.md` › "A `persist` store whose `merge` reads async reference data does not
hydrate at import": extend the rule so that a `skipHydration` store starts on `withoutWrites(storage)`,
and the one function that reads switches writes on to the slot it is about to read. The section
below it already says the middleware "offers `skipHydration` for 'do not read yet' and nothing at all
for the write side"; this closes that half. Also delete the corollary's last sentence ("neither
covers a write arriving from the visitor's own address while a restore is parked"), which is now
false. Not in conflict with `CLAUDE.md`. Its suite-level check is the unit spec above. Nothing
checks that a new `skipHydration` store starts on a storage that cannot write.
