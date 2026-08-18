---
type: missing-standard
severity: high
affected_files:
  - apps/editor/src/stores/config-store.ts
  - apps/editor/src/features/configure/lib/use-catalog-first.ts
  - apps/editor/src/stores/marketplace-store.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-17
reporting_agent: web-developer
category: architecture
domain: web
root_cause: missing-rule
status: partial
partial_note: >-
  The code side landed under EDITOR-37 — `detachSavedConfig()` plus a
  read-only storage wrapper in `config-store`, and the removal of the opening's
  `remember()` so only the dialog writes a marketplace. The standard is written
  nowhere. The sibling stores with the same latent shape — `saved-stack-store`
  and `ui-store` — are untouched and would each need the same treatment if
  anything ever puts foreign state into them.
---

## What Was Wrong

A Zustand store wrapped in `persist` writes to storage on **every** `set`. That
makes the store's slot an implicit output of every action in it, and there is no
way to say "this state is not mine to save" other than not calling any action —
which is not a thing a UI can promise.

The editor had exactly that shape and it was live. `?fromId=<id>` imported a
shared configuration by calling `importConfig`, a normal store action, so the
sharer's selection was written into `agents-inc:config:v1` — the visitor's own
slot — on arrival. The sibling `use-catalog-first` opening also called
`useMarketplaceStore.remember()` for the marketplace a payload named, so a link
could replace the one marketplace and the one PAT that slot holds.

Three things made this hard to see and easy to under-rate:

- **The overwrite reads as the feature working.** After the import the screen
  correctly shows the shared configuration, and a reload shows it again — so it
  looks like the link survived a refresh. It did not: the URL had already been
  stripped, and what came back was the sharer's configuration read out of the
  _visitor's own slot_, which it had replaced. Right answer, destroyed data.
- **Guarding the import is not enough.** Suppressing the write at
  `importConfig` alone leaves the guarantee one click deep — the visitor's first
  toggle on the shared view goes through `toggleSkill`, which persists whatever
  is in memory, which by then is the sharer's configuration plus one edit. A
  rule every action has to keep is a rule that the next action added will break.
- **It compounds with the read-side hazard.** Once the visitor's own slot holds
  ids from someone else's marketplace, the next ordinary load prunes them
  against the visitor's own catalogue and writes the empty result back. The
  read-side half of this is recorded in
  `2026-08-17-persisted-store-hydrates-before-its-reference-data.md`; the two
  are the same store seen from opposite ends, and the fix for the read side
  (`skipHydration` plus one sequencing point) does nothing about the write side.

The general shape: **a persisted store has no vocabulary for state it is
holding on behalf of something other than its own owner.** The persist
middleware offers `skipHydration` for "do not read yet" and nothing at all for
"do not write this".

## Fix Applied

Under EDITOR-37, in `apps/editor`:

- `withoutWrites(storage)` in `config-store.ts` — a pure wrapper returning the
  same `PersistStorage` with `setItem` and `removeItem` neutered and `getItem`
  live. Exported and unit-tested (`config-store.test.ts`), which is the
  arrangement `readMarketplaceSlot` established for the untrusted-read half.
- `detachSavedConfig()` beside it, which swaps the store's storage for that
  wrapper via `persist.setOptions({ storage })` and records that it has. The
  slot is held for the whole time a shared address is open, not just across the
  import, so an edit made while looking at someone else's configuration reaches
  nothing.
- `readSavedConfig()` hands the slot back, and that is deliberately part of
  _reading_ rather than a second exported verb: what is in memory while the slot
  is held is somebody else's configuration, so the once-a-session hydration
  guard has to be lifted at the same moment.
- The opening no longer calls `useMarketplaceStore.remember()` at all. A
  marketplace now reaches storage only by someone typing it into the dialog —
  which was already the rule `seatPublicCatalog` stated in its own comment ("an
  arriving link may drop what is seated and may not drop what is stored"),
  applied to the named case as well as the empty one.

Both halves are pinned end to end: `e2e/specs/shared-link.spec.ts` reads the raw
slot back and asserts the visitor's own selection is still in it while the
sharer's is on screen, and asserts the same after an edit.

`saved-stack-store` and `ui-store` were left alone. Neither can currently hold
foreign state — the saved stack is written by an explicit user action and the UI
store persists only `rosterCollapsed` — so the hazard is latent. They are named
here because the next person to make either of them carry something that arrived
from a URL will reintroduce this.

## Proposed Standard

A rule in the web standards, beside the hydration rule the sibling finding
proposes, since the two are halves of one thing:

> A store persisted with `persist` writes on every `set`, so its storage slot is
> an output of every action it owns. Before putting state into such a store that
> did not come from this browser — a shared link, an impersonation, a preview,
> anything addressed by a URL — decide where its writes go, and enforce that by
> swapping the storage rather than by guarding the actions. Export one named
> verb per direction, call them from the single place that knows which case it
> is, and make handing the slot back also re-read it: state held while detached
> is not the owner's, so the "already hydrated" guard must not suppress the read
> that restores it.

Two supporting notes, both learned rather than read:

- `persist.setOptions({ storage })` only takes effect when the value is truthy —
  it is guarded by `if (newOptions.storage)` — so passing `undefined` to mean
  "no storage" silently leaves the previous one in place. Where the slot may
  genuinely not exist (a unit runner with no `localStorage`,
  `createJSONStorage` returning `undefined`), guard the call rather than
  passing the empty value through.
- "Does the visitor's own data survive this?" is a question about **the slot**,
  not about the screen. Every assertion in this area should read
  `localStorage` back directly; a grid showing the right thing proves nothing
  about what was written under it, and in this defect the two disagreed for two
  releases.
