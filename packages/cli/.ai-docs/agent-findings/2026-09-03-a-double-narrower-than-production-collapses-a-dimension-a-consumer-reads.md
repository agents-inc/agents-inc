---
type: anti-pattern
severity: medium
affected_files:
  - packages/api-mocks/src/fixtures.ts
  - apps/editor/src/features/configure/components/stack-grid.tsx
  - apps/editor/e2e/specs/accounts.spec.ts
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
date: 2026-09-03
reporting_agent: web-developer
category: testing
domain: e2e
root_cause: premise-expired
status: open
---

# A double narrower than production collapses a dimension a consumer reads

## What happened

EDITOR-73's permitted twin drives two signed-in saves in one browser. Both land, and both
account rows are named `"Saved stack"` — not a quirk of the spec but the product: the
signed-in Save path in `roster-panel.tsx` calls `saveToAccount(SAVED_STACK_NAME, …)`, so
that is the name of every stack an account ever gains this way.

The worker gives each row `crypto.randomUUID()` (`apps/server/src/stacks.ts`). The double
gives each row `s_${name.toLowerCase().replace(/\s+/g, "-")}`
(`savedStack` in `packages/api-mocks/src/fixtures.ts`). So two rows that production
guarantees are distinct arrive from the double **identical in their id**, and
`stack-grid.tsx` renders account cells with `key={saved.id}`:

```
Encountered two children with the same key, `s_saved-stack`. Keys should be unique so that
components maintain their identity across updates. Non-unique keys may cause children to be
duplicated and/or omitted — the behavior is unsupported and could change in a future version.
```

Reproduce it with the twin, which is green and emits this on every run:

```
cd apps/editor && npx playwright test e2e/specs/accounts.spec.ts \
  -g "leaves an adopted snapshot replaced" --reporter=list
```

Measured rather than assumed: React renders **both** cells today — a deliberately failing
`toHaveCount(-1)` on the `"Saved stack"` locator answered `Received: 2`. So this is not a
wrong assertion today. It is an assertion standing on behaviour React's own message calls
unsupported, in a spec whose subject is how many cells the grid draws.

## Why nothing caught it

**The fixture states the premise, and the premise was true when it was written.** Its
docblock says the derived id is safe because "nothing on either side reads its form — both
schemas say `z.string()` — and a derived one is the same claim carrying a value an assertion
can name." Every clause of that was correct. `key={saved.id}` arrived later, in another
workspace, and nothing watches a premise.

**The survey that justified it looked at the wrong population.** "Both schemas say
`z.string()`" is a survey of VALIDATORS. What matters for an identifier is its CONSUMERS,
and the consumers of an id are mostly not assertions: React keys, `Map` keys, `Set`
membership, dedup, cache lookups. None of those appear in a schema, and none of them fail
loudly — React warns to the console, which no gate in this suite reads (`e2e/fixtures.ts`
installs no console guard).

## The class

The repository already records one half of this, in `e2e/support/sharing.ts`'s note on
`captureCreateConfig` (CLI-861): **a double LOOSER than the route it stands in for cannot
fail**, so every spec built on it is vacuous.

This is the mirror, and it fails differently rather than less: **a double NARROWER than
production — one that collapses a dimension production keeps distinct — manufactures
behaviour production cannot have.** It does not produce false greens. It produces undefined
behaviour, console noise, and a ceiling on what a spec is allowed to drive: any spec that
would make two rows collide in the double is now standing on unsupported reconciliation,
whatever it asserts.

The sharp part is that _narrowing looks like a service to testing_. A derived id is more
readable in a failure message, more greppable, and stable across runs — the docblock names
all three and they are all real. Determinism is worth having; **collapsing distinctness to
get it is the part that costs**, and the two are separable: a counter is as deterministic
as a slug and keeps every row distinct.

The dimension to watch is IDENTITY specifically. A double may narrow a timestamp, a
message, an ordering — a consumer usually reads those the same way whatever they hold. An
identifier is different: its whole contract is that two of them differ, so a double that
makes two equal has not narrowed the value, it has removed the guarantee.

## Proposed standard

For `.ai-docs/standards/e2e/test-data.md`, beside the existing rules on factories:

> **A double may simplify a value; it may not collapse a distinctness production
> guarantees.** Where the real system mints identifiers — `crypto.randomUUID()`, a database
> sequence, an insertion key — the double mints distinct ones too. Deriving an id from
> another field is fine only while no two rows can share that field, and a name a product
> constant supplies (`SAVED_STACK_NAME`) is exactly the case where they can.
>
> Determinism is not the thing to give up to get this: a per-run counter is as nameable in
> a failure message as a slug and cannot collide.
>
> And when a fixture's comment justifies a simplification by saying nobody reads the field,
> that claim is about CONSUMERS, not about schemas. Schemas validate; keys, maps, sets and
> caches consume. Re-derive it rather than inheriting it:

```
grep -rn 'crypto.randomUUID\|nanoid\|createId' apps/server/src
grep -rn 'key={' apps/editor/src --include='*.tsx' | grep -F '.id'
```

Every field in the first list that the second list reads is one this rule governs.

## Not fixed here

`packages/api-mocks/src/fixtures.ts` is another lane's file, so the change is reported
rather than made. The whole diff is the id expression in `savedStack`, plus the docblock
sentence that no longer holds:

```diff
+let minted = 0
+
 export const savedStack = (
   name: string,
   configId: string = STORED_ID,
   at: string = STACK_SAVED_AT
 ) => ({
-  id: `s_${name.toLowerCase().replace(/\s+/g, "-")}`,
+  // Distinct per row, as `crypto.randomUUID()` is on the worker: two saves in one
+  // browser are both named `SAVED_STACK_NAME`, and `stack-grid.tsx` keys its cells
+  // on this. A slug of the name made those two rows one React child.
+  id: `s_${name.toLowerCase().replace(/\s+/g, "-")}_${(minted += 1)}`,
   name,
   configId,
   createdAt: at,
   updatedAt: at,
 })
```

Two things to check before applying it, neither of which blocks it on the evidence to hand.
`SAVED_STACK` and `OTHER_SAVED_STACK` are module constants, so their ids stay stable within
a run but are no longer stable ACROSS runs — every read of the form found by
`grep -rn 's_weekend-project\|s_client-work' apps packages` is currently empty, and
`stacks.test.ts` uses `SAVED_STACK.id` symbolically rather than asserting its text. And the
package is resolved by both the editor's Vitest and its Playwright suites, so both must be
run, not one.

Fixing it removes a console error from a green suite; it does not change any assertion in
`accounts.spec.ts`, which is deliberately written against cell CONTENT — the local slot
lists the skills it holds, an account's row can only say it is in the account — rather than
against row counts, for exactly this reason.
