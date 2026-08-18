---
type: missing-standard
severity: high
affected_files:
  - apps/editor/src/stores/config-store.ts
  - apps/editor/src/stores/saved-stack-store.ts
  - apps/editor/src/features/configure/lib/use-catalog-first.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-17
reporting_agent: web-developer
category: architecture
domain: web
root_cause: convention-undocumented
status: partial
partial_note: >-
  The code side landed for `config-store` under EDITOR-31 (skipHydration plus a
  single sequencing point). The standard is not written anywhere, and one
  sibling store — `saved-stack-store` — still has the latent shape.
---

## What Was Wrong

A Zustand store persisted with the `persist` middleware hydrates **at module
import**. If that store's `merge` validates the restored blob against reference
data that arrives **asynchronously**, the validation always runs against
whatever the reference data happened to be at import — never against what the
blob was actually written against.

In `apps/editor` this was exact and load-bearing. `config-store`'s `merge` calls
`pruneUnknownIds`, which drops every skill, agent and stack id the **loaded
catalogue** does not carry. The loaded catalogue at import time is always the
vendored public one, because the marketplace catalogue is a `fetch` that cannot
have resolved yet. So a configuration built on a marketplace was pruned to
nothing every time it was read back — on reload, and again through the
`?fromId=` import path, which prunes through the same function.

Three properties made it hard to see and easy to under-rate:

- **It was reported, not silent.** `reportPruning` fired
  `[issue] Pruned saved ids the catalog no longer knows {droppedIds: 6}` into
  the console. A console line is not a screen, so nobody reading the app saw it.
- **Storage was not immediately destroyed.** Zustand's `hydrate()` uses the raw
  `set` rather than the persisting one, so the pruned state is not written back
  at hydration. The blob survives — until the user's next click, which persists
  the pruned state over it. The data loss is therefore delayed by one
  interaction, which is exactly long enough to look like it did not happen.
- **The same bug had two doors.** Reload and share-link import are different
  code paths that meet at the same pure function, so fixing one leaves the
  other, and fixing both separately leaves two orderings that must agree.

The general shape: **a persisted store whose `merge` consults asynchronously
loaded reference data must not hydrate at module import.** Nothing in the
repository said so, and the editor has a second store of exactly this shape —
`saved-stack-store` holds a `SeedPayload` that is applied through
`adoptSeedPayload`, which prunes against the same catalogue.

## Fix Applied

For `config-store` only, under EDITOR-31:

- `skipHydration: true` on the persist options, so nothing reads storage at
  import.
- A named `readSavedConfig()` export beside it, idempotent via
  `persist.hasHydrated()`, which is the one call that reads storage.
- One sequencing point — `useCatalogFirst` — that seats the catalogue and only
  then calls `readSavedConfig()`, and only then applies an arriving payload. The
  same rule serves both doors rather than each door getting a shim.

The idempotence is not decoration. Without it, leaving the screen and returning
re-ran hydration and dropped the selections `partialize` deliberately never
wrote (an added skill's), and re-fetched a 400 KB catalogue to arrive where the
app already was. Both are pinned by e2e tests.

`saved-stack-store` was left alone: it is applied on a user action rather than
at boot, so the ordering hazard is latent rather than live. It is recorded here
because the next person to make it boot-applied will reintroduce this.

## Proposed Standard

A short rule in the web standards, and a line in the editor's own store
conventions, saying:

> A store persisted with `persist` hydrates at module import. If its `merge`
> validates against data fetched at runtime — a catalogue, a feature manifest, a
> remote schema — set `skipHydration: true` and export one named function that
> reads storage. Call it from the single place that knows the reference data has
> settled. Make it idempotent (`persist.hasHydrated()`), because a component
> remount must not re-read storage over state that is now richer than what
> `partialize` writes.

Two supporting notes worth stating with it, because both were discovered the
hard way rather than read:

- `persist`'s `hydrate()` does **not** write back, so a bad hydration corrupts
  memory now and storage on the next `set`. Do not reason about it as
  immediately destructive; reason about it as destructive on a delay.
- If the same pure validator is reachable from more than one entry point, the
  ordering belongs at a single sequencing point above them, not at each entry.
  Two orderings that must agree will eventually not.
