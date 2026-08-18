---
type: architectural-drift
severity: high
affected_files:
  - apps/editor/src/features/configure/components/marketplace-dialog.tsx
  - apps/editor/src/features/configure/components/marketplace-switch-dialog.tsx
  - apps/editor/src/features/configure/lib/marketplace-switch.ts
  - apps/editor/src/features/configure/lib/use-install-command.ts
  - apps/editor/src/features/configure/lib/use-catalog-first.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-18
reporting_agent: web-developer
category: architecture
domain: web
root_cause: convention-undocumented
status: partial
partial_note: >-
  Code side landed for EDITOR-41, EDITOR-42 and EDITOR-43 — both doors now name and drop together,
  the reattach empties before the read, and the notice clears with the address. Pending: the
  Proposed Standard below is unwritten, and one adjacent hazard named at the end (a stale recovery
  surviving an address change) was fixed as part of EDITOR-43 but has no spec of its own.
---

## What Was Wrong

**One act, two controls, and the rule lived on the control rather than on the act.**

Seating a catalogue is reachable two ways: the switcher's CTA, and the marketplace dialog's Load.
The owner ruled on the switcher (2026-08-17) that it must name the concrete consequence and switch
only on the CTA — and `MarketplaceSwitchDialog.confirm()` implements that exactly, calling
`pruneToCatalog()` so the skills it named are actually dropped. `config-store`'s own comment on
`pruneToCatalog` records the reasoning:

> Called when a marketplace switch has just reseated one, and called for one reason: the switch
> dialog names the skills the target does not carry, so they have to actually go. Hidden from the
> grid is not dropped — they would still be in the install list and in any link shared from here,
> under their bare ids.

`MarketplaceForm.submit()` seats a catalogue too, and had neither half. It called `remember()` and
`load()` and stopped.

The comment predicted the outcome word for word, for the one door that had the guard. Driven in a
real browser, the other door produced it:

```
MINTED PAYLOAD: {"marketplace":"bigco/skills","matrixVersion":"9.9.9-bigco",
                 "skills":["acme-web-widgets","acme-api-gateway","bigco-web-widgets"]}
```

One payload, one marketplace ref, two marketplaces' ids. The CLI resolves those ids against the ref
at the top, so the receiver installs a subset and the sharer is never told.

**Three properties of the drift are worth separating, because each is a different lesson:**

1. **The rule was attached to a component, not to the operation.** Nothing named "seating a
   catalogue" existed as a thing with rules; there were two components that each happened to do it.
   The second one was written later and reproduced the parts the author could see on screen.

2. **The predictive comment sat on the callee, where only its existing callers read it.** The
   comment that describes exactly this failure lives on `pruneToCatalog`. Someone writing a new
   seat path never opens `pruneToCatalog`, because they are not calling it — that is the defect.
   A warning readable only from inside the guard cannot reach the door that lacks one.

3. **A third door existed and nobody counted it.** `loadPublic()` — clearing the field — seats the
   vendored catalogue and had the same gap. It is the ONLY route to the public catalogue (the
   switcher lists saved marketplaces, and the public one is never saved), so the act had three
   doors and one guard.

**Two more defects in the same area, both of the same family — a declared dependency that is not
the real one:**

- `useInstallCommand` memoises the serialised payload on `[config]` alone, while `toSeedPayload`
  reads `activeMarketplace()` and `activeVersion()` off the seat. A catalogue that moves under an
  unchanged selection therefore stamps the ref the ids were picked on rather than the one they
  will be resolved against. `ConfigureScreen` had already met this exact problem and solved it
  (subscribing to `catalog` purely to put it in a dependency list, with a comment saying so) — the
  solution was in the codebase and did not reach the second site.

- `useCatalogFirst`'s effect is keyed on the address and clears nothing on the way out, so the
  shared-configuration notice — and the parked recovery beside it — outlived the address they
  described. The notice is what promises a visitor their own configuration is safe; left standing
  over the visitor's own grid it is the app vouching for a swap that had just happened
  (EDITOR-42's compounding half).

## Fix Applied

**EDITOR-41.** The dialog names the same consequence in the same words and seats only on a second,
explicit press. Both are deliberate:

- **Same words, same function.** `switchConsequence` is reused verbatim rather than given a second
  phrasing — "Switching to bigco/skills will drop 2 of your 2 skills: …". Loading a different
  catalogue IS a switch, and using one sentence at both doors is the strongest available statement
  that they are one act.
- **A shared decision, not a shared sentence.** `dropsSelection(target, selectedIds)` is a new
  export beside `switchConsequence`, because each door has to decide whether there is a consequence
  worth naming before it can name one. Reading the sentence back to find out would make the two
  doors agree by coincidence.
- **No second press when nothing is at stake.** A load that drops nothing seats on the press that
  asked for it, which is every first load of a session. This is pinned by a spec of its own, and by
  every marketplace spec written before this change.
- **The public door goes through the same path.** `PUBLIC_TARGET` carries the vendored matrix, so
  clearing the field is read, described and confirmed exactly as naming a repository is — with no
  fetch, because the matrix is already in hand.

**EDITOR-42.** `reattachSavedConfig()` empties the store before handing the pen back. Taking the
slot back is precisely the statement "what is in memory is not this browser's", so the emptying
belongs there rather than inside a `merge` that cannot tell the two cases apart. It is done while
the no-write storage is still attached, so the clearing is not itself a write. This also covers the
branch `merge` could never have: an UNPARSEABLE blob on the reattach took the same "return
`current`" path and would have handed the visitor the stranger's configuration too.

**EDITOR-43.** The effect clears both the notice and the recovery when the address changes.

## Proposed Standard

**Name the operation, and put the rule on it.** Where two or more controls perform the same
state-changing act, the act needs a named home — a lib module — and the rules belong there, not on
whichever component implemented it first. `marketplace-switch.ts` is now that home for seating a
catalogue: it owns the sentence (`switchConsequence`) and the decision (`dropsSelection`), and a
third door added tomorrow finds both by looking for the act rather than by remembering to read a
comment on a store action.

The reviewable form of the rule, and it is a question rather than a checklist item:

> **"What else performs this act?"** — asked of every state-changing operation, before writing the
> second one. If the answer is more than one control, the guard belongs in a module both call, and
> the count of doors goes in that module's header.

Where: a new subsection in the web standards on multi-door operations. `pruneToCatalog`'s comment
should be shortened to point AT that module rather than restating the reasoning, so the explanation
lives where a new door's author will be reading.

**Corollary, for hooks that read a store outside React.** A `useMemo` whose callback calls a
non-reactive reader (`activeMarketplace()`, `activeVersion()`, `activeCatalog()`) has dependencies
that the dependency array cannot see and `exhaustive-deps` will never flag — it flags them as
UNNECESSARY, which is the opposite advice. The established answer is already in
`ConfigureScreen`: subscribe with a selector purely to name the value in the array, and disable the
rule with a comment saying why. That pattern should be written down as the rule for `active*`
readers rather than rediscovered per site; it has now been rediscovered twice.

## Adjacent, Not Fixed

`MarketplaceSwitchDialog` still has no spec for the case where a switch is confirmed while a
restore is parked. The write-side hazard there is closed by
`2026-08-18-a-store-action-that-changes-nothing-still-writes-the-slot.md`, but "confirming a switch
finishes a parked restore correctly" is asserted nowhere, and the switcher takes `recovery` for
exactly that purpose.
