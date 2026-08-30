---
type: missing-standard
severity: medium
affected_files:
  - apps/editor/src/stores/ui-store.ts
  - apps/editor/src/stores/marketplace-store.ts
  - apps/editor/src/stores/saved-stack-store.ts
  - apps/editor/src/stores/ui-store.test.ts
  - apps/editor/src/stores/config-store.test.ts
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-08-26
reporting_agent: web-tester
category: testing
domain: web
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`apps/editor`'s unit suite runs on `environment: "node"` — there is no `window`. Zustand's persist
middleware resolves its storage ONCE, at store creation, and its default is
`createJSONStorage(() => window.localStorage)`. `createJSONStorage` catches the resulting
`ReferenceError` and returns `undefined`, and `persistImpl` then takes this branch
(`node_modules/zustand/esm/middleware.mjs`, the `if (!storage)` arm):

```js
if (!storage) {
  return config(
    (...args) => {
      console.warn(`[zustand persist middleware] Unable to update item …`);
      set(...args);
    },
    get,
    api,
  );
}
```

It returns **before** `api.persist` is ever assigned. Two consequences, and they fail in opposite
directions:

1. **Anything that asks the store about its own persistence is unreachable.** `store.persist` is
   `undefined`, so `store.persist.getOptions()` throws a `TypeError` naming `getOptions` — which
   points at zustand rather than at the missing browser, from a line that looks like ordinary
   store access. There is no way to assert `version`, `partialize` or `merge` from a node test
   without standing a browser up first.
2. **Anything that only calls ACTIONS passes, and persists nothing.** `set` still runs, so every
   state transition behaves; only the write is gone. A test that changes state and then claims
   something about what was saved is vacuously green, and the only signal is a `console.warn` per
   `set` that no assertion in this suite subscribes to.

The census — every store in `apps/editor/src/stores` that calls `persist(`, and whether it declares
its own `storage:`:

```
grep -rln 'persist(' apps/editor/src/stores/*.ts | while read f; do \
  printf "%s storage-declared=%s\n" "$f" "$(grep -c 'storage:' "$f")"; done
```

At the time of writing that returns four stores, and **three of the four declare none** —
`ui-store`, `marketplace-store` and `saved-stack-store` are all on the default and all in this
class. Only `config-store` names its own slot.

**The rule that exists is one store narrower than the class.** `config-store.test.ts`'s
`storeOnAWatchedSlot` documents the stub and the dynamic import, and its docblock says exactly why
— "the browser has to be standing BEFORE the import". But it says it of a store whose slot is
`createJSONStorage(() => window.localStorage)` _written out in the source_, so a reader concludes
the requirement belongs to that explicit declaration. It does not: the default reaches for the same
`window.localStorage`, and the failure it produces is a different and less legible one. Nothing
in the tree said so, and `ui-store` had no test at all to find it with.

## Fix Applied

None to product code — this pass writes tests only. `apps/editor/src/stores/ui-store.test.ts`
carries `uiStoreOnAStandingBrowser()`, which stubs `window`, calls `vi.resetModules()` and imports
the store dynamically, with a docblock naming the default storage as the reason and citing
`storeOnAWatchedSlot` as the precedent it copies.

The first draft of that file did not do this and cost two full runs: the first stubbed nothing and
died on `store.persist`, the second stubbed the bare global `localStorage` — which is the wrong
identifier, and produced the same error with no new information.

## Proposed Standard

Add to `apps/editor/e2e/README.md`'s sibling material for the unit suite — or, if the editor gains
a `src/stores/README.md`, there — one paragraph under a heading like **"A persisted store needs a
browser before it is imported"**:

> Every store in `src/stores` is wrapped in zustand's `persist`, and persist resolves
> `window.localStorage` once, at store creation. This suite runs in node. A store imported without
> a `window` standing silently loses its `api.persist` handle and its writes, while its actions go
> on working — so a test of its persistence is unreachable and a test of its state is green about
> a slot nothing was written to. Stand the browser first, then `vi.resetModules()`, then import the
> store dynamically. `storeOnAWatchedSlot` in `config-store.test.ts` and
> `uiStoreOnAStandingBrowser` in `ui-store.test.ts` are the two shapes; the second exists because
> the requirement is NOT a property of declaring your own `storage:` — the default reaches for the
> same `window`.

Cross-checked against `packages/cli/CLAUDE.md`: this conflicts with nothing there. It is adjacent
to the "never define local parser/extractor helpers inside a test file" rule and does not breach
it — a storage stub is test infrastructure with no logic to get wrong, and both instances of it
live in the file that needs them, as `config-store.test.ts` already does.

**What would catch a violation:** nothing mechanical today, and that is worth stating plainly. A
store test that forgets the stub does not fail — it passes while persisting nothing. The cheapest
gate would be a suite-level assertion that no `[zustand persist middleware] Unable to update item`
warning is emitted during the run, which is the same shape `persistence.spec.ts` already uses for
the app's `[issue]` seam. That is a proposal, not part of this pass.
