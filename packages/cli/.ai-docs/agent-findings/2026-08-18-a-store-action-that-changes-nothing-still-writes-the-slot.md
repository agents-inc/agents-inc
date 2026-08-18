---
type: anti-pattern
severity: high
affected_files:
  - apps/editor/src/stores/config-store.ts
  - apps/editor/src/features/configure/components/marketplace-dialog.tsx
  - apps/editor/src/features/configure/components/marketplace-switch-dialog.tsx
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-18
reporting_agent: web-developer
category: architecture
domain: web
root_cause: convention-undocumented
status: partial
partial_note: >-
  Code side landed for the door this row touched — `pruneToCatalog` now returns before `set` when
  nothing was dropped, which fixes BOTH callers at once, the switcher included. Pending: the
  Proposed Standard below is not written into any standards doc, and the switcher's own reachability
  of the same sequence (a parked restore plus two saved marketplaces) has no spec.
---

## What Was Wrong

Zustand's `persist` writes on every `set`. A store action that recomputes state into an equal
copy is therefore a WRITE, not a no-op — and `config-store`'s `pruneToCatalog` was exactly that
shape:

<!-- Quoted verbatim from apps/editor, which the ROOT prettier config formats WITHOUT semicolons.
     This file lives under packages/cli, which formats WITH them, so leaving prettier to the block
     would rewrite the quotation into something that no longer matches the file it cites. -->
<!-- prettier-ignore -->
```ts
pruneToCatalog: () => {
  useUiStore.getState().clearFlash()
  set((state) => pruneUnknownIds(state))
}
```

`pruneUnknownIds` builds fresh objects unconditionally, so pruning an EMPTY store still replaced
the state and still put the empty result in `localStorage`.

That is harmless everywhere except one sequence, and the editor reaches it:

1. A configuration is saved against a marketplace that later stops loading (an expired PAT).
2. `useCatalogFirst.openOwn()` parks the restore — deliberately, so the saved ids are never read
   against a catalogue that has never heard of them. **Nothing has been read; the store is empty
   by construction** (`skipHydration: true`).
3. The visitor supplies the token and presses Load. The press seats the catalogue, and seating a
   catalogue prunes.
4. The prune writes an empty configuration over the slot — and only THEN does
   `recovery.onSeated()` run `readSavedConfig()`, which reads back the emptiness the press just
   wrote.

The recovery destroys the configuration it exists to recover.

This was found while adding `pruneToCatalog()` to the marketplace dialog (EDITOR-41). It was
caught by two pre-existing specs, which is the good news:

```
2 failed
  [chromium] › e2e/specs/catalog-first.spec.ts:135:3 › a saved marketplace that no longer loads › restores the whole configuration once the token arrives
  [chromium] › e2e/specs/catalog-first.spec.ts:170:3 › a saved marketplace that no longer loads › finishes from the button after the prompt was cancelled
```

**The switcher has the identical latent defect and always did.** `MarketplaceSwitchDialog.confirm()`
runs `choose() → load() → pruneToCatalog() → recovery?.onSeated()` — the same order, for the same
reason. It is unreached today only because a browser needs two saved marketplaces AND a parked
restore at once to get there, and no spec arranges both. The dialog door made the sequence ordinary
rather than exotic, which is why it surfaced now.

## Fix Applied

`pruneToCatalog` returns before `set` when nothing was dropped:

<!-- apps/editor source again, quoted verbatim — see the note above the block above. -->
<!-- prettier-ignore -->
```ts
const pruned = pruneUnknownIds(get())
if (!droppedAnything(get(), pruned)) return
set(pruned)
```

`droppedAnything` is extracted from `reportPruning`, which already asked the same question to
decide whether to report — so the two now share one answer instead of computing it in two shapes.
It fixes both callers at once, the switcher included, because the guard lives in the action rather
than at either door.

Pinned by two unit tests in `config-store.test.ts` asserting **state identity** rather than
watching a slot: `expect(useConfigStore.getState()).toBe(before)`. Identity is the fact underneath
— no new state object means no `set`, and no `set` means no write, whatever storage is attached.
That also makes the test runnable in the node environment this suite uses, where there is no
`localStorage` to watch.

## Proposed Standard

Two rules, and the first is the general one:

**1. A persisted store's action must not `set` when it changes nothing.** Under `persist`, `set`
IS the write, so "recompute and store the result" writes even when the result is equal. The
existing convention in this codebase is already to return early — `catalog-store`'s `addExternal`
opens with `if (fresh.length === 0) return`, and `useCatalogFirst`'s `seatPublicCatalog` with
`if (activeMarketplace() === null) return` — but it is written nowhere, so it reads as three
independent micro-optimisations rather than one rule about writes. It is not an optimisation: it
is what stops an action from overwriting state that has not been read yet.

Where: a new subsection of the web standards covering Zustand stores, named for the mechanism —
"`set` is the write" — with `pruneToCatalog` as the worked example.

**2. Nothing may write the config slot between a parked restore and the read that finishes it.**
This is the narrower, editor-specific rule and it is the one a reviewer can actually check: the
window between `park(...)` and `finishRestore()` is a window in which the slot holds the only copy
of the visitor's configuration and memory holds none of it. The current design defends this window
with `skipHydration` + `detachSavedConfig`, and both are about READS and about SHARED addresses —
neither covers a write from the visitor's own address during a parked restore.

Where: alongside the `readSavedConfig` doc comment in `config-store.ts`, which already explains the
ordering contract for reads and is the obvious place a reader looks for the writes half.
