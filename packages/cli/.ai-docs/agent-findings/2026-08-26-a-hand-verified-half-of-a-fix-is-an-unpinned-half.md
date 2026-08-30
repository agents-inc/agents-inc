---
type: standard-gap
severity: medium
affected_files:
  - packages/compile/src/config-source.ts
  - packages/compile/src/seed-to-config.ts
  - packages/compile/src/contract/emission-scenarios.ts
  - packages/cli/src/cli/stores/wizard-store.ts
  - packages/cli/src/cli/lib/config-gate/propagate.ts
  - packages/cli/src/cli/lib/wizard/scope-diff.ts
  - packages/cli/src/cli/lib/schemas.ts
  - packages/cli/src/cli/lib/__tests__/factories/config-factories.ts
  - packages/cli/src/cli/lib/configuration/__tests__/config-round-trip.test.ts
standards_docs:
  - .ai-docs/reference/config/config-writer.md
date: 2026-08-26
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  The pin landed. `config-round-trip.test.ts` now carries "re-emits a config whose agent
  tombstone carries model and effort with the same bytes", proven red with the agent arm
  of `withEntriesInSchemaOrder` removed and green with it restored. What did NOT land is
  the corpus-level half — nothing yet requires a `resolved_by:` that says "hand-verified"
  to name what would catch a regression, so the next half-fix filed the same way is
  invisible in the same way.
---

## What Was Wrong

`2026-08-26-a-config-entrys-own-key-order-is-the-producers-so-the-writer-is-not-a-fixed-point.md`
closed with `status: resolved`, and both its diagnosis and its `resolved_by:` are correct about
the code — this finding extends it rather than superseding it, and no cross-link is claimed. It
also contains the sentence that is the whole subject here:

> The agent-side twin the pin does not cover was fixed in the same pass and **hand-verified**:
> an entry minted `{ name, excluded, scope }` emits `{"name":…,"scope":…,"excluded":true}`.

Two halves of one fix, filed as one resolution. The skill half has a pin — "re-emits a config
carrying a wizard-minted global tombstone with the same bytes". The agent half had a sentence.
Removing the agent arm of `withEntriesInSchemaOrder` in `packages/compile/src/config-source.ts`
left **217/217 test files and 7337 tests green**, so the fix was load-bearing and unowned:
the next person to simplify that function deletes it, every gate agrees, and the editor's
preview starts drawing an agent line no install writes.

**The reason nobody wrote the pin is the part worth recording, because it will recur.** No
production producer of an `AgentScopeConfig` disagrees with the loader's key order today.
Census — the command, and its whole output is 19 hits across 6 files (the six at the top of
`affected_files:`; the three below them are files the claim rests on that this grep does not
reach):

```
grep -rnE 'name: *[A-Za-z_"][^,;]*, *scope:|\.\.\.[A-Za-z]+, *excluded: true|scope: *"(global|project)"( as const)?, *(excluded|model|effort)' \
  packages/cli/src/cli packages/compile/src --include='*.ts' --include='*.tsx' \
  | grep -v '__tests__' | grep -v '\.test\.'
```

Every agent-side hit either writes `excluded` last (`applyAgentToggle`,
`restoreDualScopeAgent` and `toggleAgentScope` in `wizard-store.ts`) or appends it by spread
(`maskCollidingGlobalAgents` in `config-gate/propagate.ts`). Two more producers are NOT in that
output and were found by reading the two modules the census names — `buildAgentConfigForName`
in `wizard-store.ts` and `agentScopeConfig` in `seed-to-config.ts` reach `model` and `effort`
through conditional spreads, which the regex does not match; both write
`{ name, scope, model, effort }`, the loader's own order. Both skill-side hits
(`wizard-store.ts:325` and `:1686`) put `excluded` before `origin`, which is exactly why the
skill arm had a real producer to pin against and the agent arm did not.

So the agent arm's only order-disagreeing producer in the entire tree is a test factory:
`buildAgentConfigs` in `__tests__/factories/config-factories.ts` inserts `excluded` BEFORE
`model` and `effort`. That makes the pin writable, and it makes the pin fragile in a way the
skill-side one is not — tidy the factory to match the schema and the spec goes green forever
while testing nothing.

## Fix Applied

The pin, plus the guard that keeps it from going vacuous. In `config-round-trip.test.ts`:

```ts
expect(
  Object.keys(elementAt(agents, 1)),
  "the tombstone must reach the writer with `excluded` ahead of the two overrides",
).toStrictEqual(["name", "scope", "excluded", "model", "effort"]);
```

Without that line the spec is a fixed-point comparison whose two sides agree for free the day
`buildAgentConfigs` is reordered. With it, a factory change reddens on the line that owns the
assumption and says what the pin needs — a producer that still disagrees — rather than passing
silently. Verbatim failure with the arm removed, which is the diff the whole thing is about:

```
-   {"name":"web-developer","scope":"global","excluded":true,"model":"opus","effort":"high"},
+   {"name":"web-developer","scope":"global","model":"opus","effort":"high","excluded":true},
```

## Proposed Standard

**A `resolved_by:` saying a half was verified by hand is a statement that the half is
unpinned, and it should have to say so.** This is CLAUDE.md's existing "name what would catch
it" discipline arriving at the findings corpus, where it is currently absent: `TEMPLATE.md`
asks `resolved_by:` to "cite the mechanism of resolution (commit hash, PR, doc update,
standards section, superseding finding)" and a hand-verification satisfies that list while
telling a reader nothing about whether the fix will survive the next pass. Every one of the
listed mechanisms records that the fix HAPPENED; none records what would notice it stop.

Proposed wording for `TEMPLATE.md`, in the "How to resolve a finding" block beside the
existing `resolved_by:` instruction: _where a resolution covers more than one site, the note
says which sites a spec covers and which were established by inspection, and names the spec.
"Hand-verified", "confirmed by inspection" and "checked manually" all mean the same thing —
nothing will report a regression — so write that consequence out rather than the method._

The reason to put it on the template rather than on a checker: the question is "does anything
fail if this is undone", which cannot be answered by matching a construct. What CAN be
mechanised is narrower and is not proposed here, because the census that would justify it has
not been run — a scan for `resolved_by:` values containing "hand-verified" / "by inspection"
would name candidates but could not grade them, and a report nobody can act on is worse than
the sentence.

Checked against CLAUDE.md before proposing: no conflict. It adds no abstraction and no gate,
and it does not touch the NEVER/ALWAYS rules — it is a required field growing one clause.

One thing deliberately NOT proposed: reordering `buildAgentConfigs` to match the loader's
schema. It is the only order-disagreeing agent-entry producer left, and the pin needs it. A
future pass that decides the factory should be canonical owes the pin a different producer
first — which is precisely what the `Object.keys` guard says when it reddens.
