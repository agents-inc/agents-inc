---
type: architectural-drift
severity: high
affected_files:
  - packages/cli/src/cli/lib/installation/local-installer.ts
  - packages/cli/src/cli/lib/configuration/config-generator.ts
  - packages/cli/src/cli/lib/configuration/default-stacks.ts
standards_docs:
  - .ai-docs/reference/features/built-in-catalogue.md
date: 2026-08-06
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: "CLI-400 — `buildStackProperty` now resolves every unflagged assignment against `PRELOAD_DEFAULTS` before the stack reaches `existingStack`, so a stack application carries a decided load rather than an absent one; pinned by `config-generator.test.ts` (unflagged vs authored) and two `local-installer.test.ts` specs (built-in stack applied vs installed config re-edited)."
---

## What Was Wrong

`buildEjectConfig` overlays a selected stack into the config generator's `existingStack`:

```ts
{ ...buildStackProperty(loadedStack), ...existingStack }
```

`existingStack` is the generator's **explicit tier** — `priorLoadState` reads an entry there as
somebody's decision, and its rule is `preloaded === true ? "preloaded" : "lazy"`. An entry with no
flag is therefore read as a deliberate lazy, because the config writer only ever emits `preloaded`
where it is true, so a bare entry read back off disk really is the user's curated lazy (D-220).

That reading is right for a saved config and wrong for a stack. A stack application is a NEW
selection, not a prior save. While the built-in stacks hand-wrote `preloaded: true` the difference
was invisible: the flags happened to be the opinion the tier was quoting. Stripping them (CLI-400's
first step) made it visible immediately — every skill a stack applied became explicitly lazy, and
the shared mapping never got asked, even though the same skill picked by hand went straight to it.

The hazard is structural, not particular to the built-ins: any producer feeding data into an
explicit tier is asserting that somebody wrote it. Nothing in the type or the call site said so —
`SkillAssignment.preloaded` is optional, and "absent" silently meant two different things depending
on which side of the spread the entry came from.

The same conflation had a second life in the generated `STACK_PRELOADS` table, which answered the
editor's question per skill rather than per pair: a framework preloaded on its own domain's
developer claimed to preload on every summoner the stack also gave it to. Both are gone.

## Fix Applied

`buildStackProperty` is now where a stack's WHICH becomes a WHICH + HOW. An assignment carrying a
flag rides through untouched — a third-party source's stacks file is a legitimate explicit tier, and
`loadStacks` gives even its bare strings an explicit `preloaded: false`. An assignment carrying no
flag takes `resolveLoadState`'s verdict for that exact `(skill, agent)` pair, which is the same
function a freshly picked skill goes through. By the time the overlay reaches `existingStack`, every
entry states a load, so the prior-vs-mapping rule below it never has to guess which kind it is.

Three pins hold the distinction: an unflagged stack resolves per agent, an authored flag survives in
both directions, and a re-run over an installed config keeps what the user saved (the on-disk stack
still spreads last and wins per agent).

## Proposed Standard

`.ai-docs/reference/features/built-in-catalogue.md` → "Structural invariants" now states that no
built-in assignment carries `preloaded` and that `buildStackProperty` resolves them. The general
rule that section should be read as carrying:

**A value handed to a tier that means "somebody decided this" must have been decided by somebody.**
When a producer has no opinion, it either resolves one before the handoff (what
`buildStackProperty` does now) or reaches the consumer through a separate input that says so. An
optional field is not a channel for "no opinion" once any reader treats its absence as an answer.
