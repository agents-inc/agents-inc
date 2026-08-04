---
type: missing-standard
severity: medium
affected_files:
  - src/cli/lib/wizard/scope-diff.ts
  - src/cli/lib/wizard/index.ts
  - src/cli/lib/configuration/config-merger.ts
standards_docs:
  - CLAUDE.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-07-30
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

In plain terms: the rule book tells agents not to publish a function that only their own
file uses. But the accepted fix for a real bug is exactly that — publish one shared
function for building a lookup key, so that two screens can never build the key
differently. Following the rule literally undoes the fix.

The specific rule, from `CLAUDE.md` -> "Code Style":

> NEVER export constants only used within the same file — run grep before adding `export`.

The specific pattern it collides with is `skillSlotKey` in
`src/cli/lib/wizard/scope-diff.ts`. Two wizard surfaces — the Sources tab and the confirm
step — each compute "what is about to change" and must agree. D-278 happened because they
built their match key differently: one keyed on skill id alone, the other on
`(id, scope)`. The remedy was a single exported helper both surfaces call.

The agent side had the same two inline key literals and no helper. Adding `agentSlotKey`
alongside `skillSlotKey` and exporting it from the `lib/wizard/index.ts` barrel closes
that precondition — but `agentSlotKey` currently has exactly one consumer, `scope-diff.ts`
itself. A future agent applying the export rule mechanically would grep, find one
same-file user, drop the `export`, and the next surface that needs an agent slot key would
write its own literal. That is the D-278 precondition, restored by a rule intended to
reduce surface area.

The rule is right about its usual target (an incidental constant that leaked an `export`).
It is not specific enough to distinguish that from an identity/key helper whose entire
purpose is to be the single definition of how a thing is matched. For those, a second
consumer is the expected future, and the export is what makes divergence impossible rather
than merely unlikely.

A related trap sits one directory over. `src/cli/lib/configuration/config-merger.ts`
defines `agentKey` and `skillKey` as `` `${name}:${scope}${excluded ? ":excluded" : ""}` ``
— a compound MERGE identity (D-221) that deliberately distinguishes a tombstone from an
active entry. Those are NOT the slot keys and must not be routed through
`skillSlotKey`/`agentSlotKey`: folding in the excluded discriminator, or dropping it, would
change merge behaviour. The D-278 fix correctly left `skillKey` alone. An agent told to
"route every agent key through `agentSlotKey`" would plausibly get this wrong, because both
key families read as `` `${a}:${b}` `` at a glance.

## Fix Applied

Code: added `agentSlotKey(name: AgentName, scope: SkillScope | undefined)` to
`scope-diff.ts` beside `skillSlotKey`, exported it from `src/cli/lib/wizard/index.ts`, and
replaced both inline agent key literals (the baseline `Set` construction in
`computeScopeDiff` and the probe in `classifyAgentDiffRow`). Output is byte-identical:
same two values, same order, same separator.

Docs: `.ai-docs/reference/features/wizard-flow.md` no longer says "the agent keys are still
built inline ... because no second surface consumes them"; the exported-function and
consumer tables now carry `agentSlotKey`, with its single-consumer status stated plainly so
nobody mistakes it for an accidental export.

Standards: nothing changed. The `CLAUDE.md` rule still reads as an unqualified NEVER, so
the conflict is live.

## Proposed Standard

Amend the `CLAUDE.md` -> "Code Style" bullet to carry its exception:

> NEVER export constants only used within the same file — run grep before adding `export`.
> **Exception: identity/key helpers.** A function whose job is to define how entities are
> MATCHED (slot keys, merge keys, dedup keys, cache keys) may be exported before a second
> consumer exists. For these, the export is the guarantee — a second surface that computes
> the key itself, differently, is the defect class the helper prevents (D-278). Name them
> `*SlotKey` / `*Key` and say in the JSDoc that the export is pre-emptive, so the next grep
> finds the reason instead of an apparently-unused export.

And add to `.ai-docs/standards/clean-code-standards.md`, near any DRY guidance:

> **Key families are not interchangeable.** Before routing a key construction through a
> shared helper, check WHICH key it is. The wizard has at least two `` `${a}:${b}` ``
> families that must stay separate: the SLOT key (`skillSlotKey` / `agentSlotKey` in
> `lib/wizard/scope-diff.ts`, `(id, scope)`, used for session diffs) and the MERGE key
> (`skillKey` / `agentKey` in `lib/configuration/config-merger.ts`, `(id, scope, excluded)`,
> used for D-221 entry identity). They look identical and mean different things. Unifying
> them changes merge behaviour.
