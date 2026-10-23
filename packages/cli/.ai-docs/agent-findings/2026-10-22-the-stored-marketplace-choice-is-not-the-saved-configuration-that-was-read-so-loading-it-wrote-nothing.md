---
type: anti-pattern
severity: high
affected_files:
  - apps/editor/src/features/configure/lib/use-marketplace-load.ts
  - apps/editor/src/features/configure/lib/use-apply-stack-request.ts
  - apps/editor/e2e/specs/catalog-first.spec.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-22
reporting_agent: web-developer
category: architecture
domain: web
root_cause: missing-rule
status: partial
partial_note: >-
  Code half landed: the load's landing (`landingFor`) and the stack path (`opensItsOwnConfiguration`)
  ask `marketplaceOnScreen`, which is the slot actually read. Pending: no rule in
  editor-and-worker.md says which of the two facts such a decision asks. The switch question's use
  of the same check (`costOfPayload`) is also pinned by no spec.
---

## What Was Wrong

The editor holds two facts that agree most of the time. `useMarketplaceStore`'s `current` names the
marketplace whose saved configuration a restore WILL read. `savedConfigurationOnScreen()` names the
one that WAS read. While a restore is parked on a failed load, `readSavedConfig` has not run
(`openOwn` defers it to `finishRestore`). So `savedConfigurationOnScreen()` is `null`, and the
config store is still on `UNWRITTEN_SLOT`, so it writes nothing (see
`2026-10-22-a-persisted-store-writes-before-its-first-read-so-a-pick-during-the-opening-overwrote-the-saved-configuration`).

Two decisions asked the stored choice:

- the stack path's `another` in `use-apply-stack-request.ts`
- `landingFor`'s `reread` landing in `use-marketplace-load.ts`

As a result, in two cases `readSavedConfig` was skipped and every edit after it was dropped without
a word:

- applying a saved stack built on the stored marketplace once that marketplace loaded;
- loading the stored marketplace after another payload had parked in the restore's place. This
  case took `reread` → `pruneToCatalog`. Re-derived below as the saved configuration not
  reopening. That the edits after it were dropped too follows from the store staying on
  `UNWRITTEN_SLOT`, and the lane's review reproduced it ("slot unchanged by the edit").

Before the E2b change the store wrote from the start, so a stale answer here cost nothing. Turning
writes off until a read is what made it silent loss.

Re-derived 2026-10-23 by serving the old question back without writing the tree, through the
out-of-tree Vite config of
`2026-10-21-a-mutant-only-playwright-reaches-can-be-served-to-the-dev-server-without-writing-the-shared-tree`.
The control without a mutant gave 12 passed for `catalog-first.spec.ts` › "a saved marketplace that
no longer loads", and a log line showed each mutant was served.

- `const another = opensItsOwnConfiguration(marketplace)` → `… = marketplace !== useMarketplaceStore.getState().current`:
  "keeps a stack applied on it once it loads, and the picks after it" goes red. The pick after the
  stack, Acme Gateway, reads `aria-pressed` "false" after the reload. Result: 1 failed, 11 passed.
- `standing: marketplaceOnScreen(),` → `standing: useMarketplaceStore.getState().current,`: "reopens
  it once it loads, after a stack on another marketplace parked in its place" goes red. Acme
  Widgets reads `aria-pressed` "false" after the load; the Install button reads `0 agents · 0 skills`. Result:
  1 failed, 11 passed.

The E2b fix lane also reported that each spec failed on the tree before its fix. That tree is no
longer on disk: `use-marketplace-load.ts` is untracked.

## Fix Applied

From the E2b fix lane, 2026-10-22, re-derived 2026-10-23. `marketplaceOnScreen()` in
`use-marketplace-load.ts` answers with a shared link's catalogue, or otherwise with
`savedConfigurationOnScreen()`. `landingFor` and the exported `opensItsOwnConfiguration` both ask it.
`standingMarketplace` is gone, folded into `leavingNow`.

Class census, 2026-10-23, of the readers of the stored choice: `grep -rn 'useMarketplaceStore'
apps/editor/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep 'current'` gives 4
hits. None of them decides whether a slot was read:

- `use-catalog-first.ts` (`restoreSavedCatalog`): which catalogue to seat.
- `use-marketplace-load.ts` (`leavingNow`): whose configuration is on screen. It asks
  `savedConfigurationOnScreen()` for whether that configuration was read.
- `marketplace-dialog.tsx`: the field's prefill.
- `nav-rail.tsx`: which saved marketplaces the switcher offers.

`opensItsOwnConfiguration` has two callers, `adopt` and `costOfPayload` (the switch question's
wording). `costOfPayload` is pinned by nothing. Serving `return opensItsOwnConfiguration(marketplace)`
as `return marketplace !== useMarketplaceStore.getState().current` left all of these green:

- the editor's whole unit suite (1042 passed | 1 expected fail);
- 157 Playwright specs across `catalog-first`, `saved-stack-apply`, `saved-stack-applied`,
  `stacks`, `save-stack`, `accounts` and `marketplace-switch`.

The answers differ only while a restore is parked, or while a link is open, and no spec opens the
switch question in either state.

## Proposed Standard

`editor-and-worker.md`, beside "A persisted store has no vocabulary for state that is not this
browser's". Which marketplace the visitor chose and which saved configuration was read are two
facts:

- A decision whose outcome is reading a slot or skipping the read asks the slot that was read
  (`savedConfigurationOnScreen()`, or `marketplaceOnScreen()` where a link counts).
- The stored choice answers only which catalogue to seat, and whose configuration is waiting.

The fix lane also offered `apps/editor/e2e/README.md` › Conventions. That file governs specs, and
this rule governs product code. Not in conflict with `CLAUDE.md`.

What catches a regression: the two `catalog-first.spec.ts` specs, one per decision. A third would
open the switch question for a stack on the stored marketplace while its restore is parked. No
such spec exists yet.
