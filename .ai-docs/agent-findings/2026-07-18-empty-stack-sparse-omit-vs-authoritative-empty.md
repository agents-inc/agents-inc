---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/configuration/config-generator.ts
  - src/cli/lib/configuration/config-merger.ts
  - src/cli/lib/configuration/config-generator.test.ts
standards_docs:
  - .ai-docs/reference/concepts/tombstone-pattern.md
date: 2026-07-18
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: "config-generator.ts buildStackForSelection now returns {} (not undefined) whenever agents participated in the rebuild; undefined is reserved for the no-agent 'stack untouched' case. Merger's existing {}-vs-undefined contract does the rest."
---

## What Was Wrong

`generateProjectConfigFromSkills` conflated two semantically distinct outcomes into a single `undefined` stack value:

1. **"This caller did not touch the stack"** (no agents in play) — the merger should preserve the existing on-disk stack.
2. **"The generator authoritatively rebuilt the stack and it came out empty"** (agents in play, but the last categorized skill was removed) — the merger should DROP the stale existing stack.

`buildStackForSelection` short-circuited to `undefined` whenever `activeSkillsByCategory.size === 0`, regardless of whether agents were selected. `mergeConfigs` then hit its `newConfig.stack === undefined && existingConfig.stack` fallback and resurrected the OLD stack verbatim — including the just-removed skill. Net effect: removing an agent's only categorized skill cleared `skills[]` and deleted files on disk but left a stale reference in the `stack` property of `config.ts`.

The merger already had the correct `{}`-vs-`undefined` contract (two dedicated tests: "should use new config empty stack {} (not preserve existing)" and "should preserve existing stack when new config has no stack at all"). The generator simply never produced `{}` — it always collapsed empty rebuilds to `undefined`, defeating that contract.

Worse, a unit test (`config-generator.test.ts` → "skips local skills in stack (no category)") had codified the buggy sparse-omit behavior by asserting the `stack` key was ABSENT when an agent was selected but no skill had a category. That test lent false authority to the bug.

## Fix Applied

- `buildStackForSelection` now returns `undefined` ONLY when `agentList.length === 0` (no stack management by this caller). When agents ARE in play it always returns the rebuilt object — `{}` when empty — so an authoritative empty rebuild is distinguishable from "untouched".
- No merger change was needed: `mergeConfigs` already trusts `{}` and only falls back to the existing stack on genuine `undefined`.
- Updated the one unit test that had encoded the old sparse-omit behavior to assert `stack: {}` (the corrected authoritative-empty contract). This was a tightening, not a broadening.

## Proposed Standard

Document the invariant in `.ai-docs/reference/concepts/tombstone-pattern.md` (or a config-merge concepts doc):

> **Empty vs. absent is meaningful in merge inputs.** A config mutator that _participates_ in a field must emit that field explicitly — an empty collection (`{}` / `[]`) means "authoritatively empty, drop what was there", while an _omitted_ key (`undefined`) means "I did not touch this, preserve the existing value". Never collapse an authoritative-empty rebuild to `undefined`; that hands the merge a false "untouched" signal and resurrects stale data.

Testing corollary for `.ai-docs/standards/` testing guidance: assertions that check for the ABSENCE of a merge-participating key (e.g. `expect(config.stack).toBeUndefined()`) must confirm the producer genuinely did not participate. When the producer DID run the rebuild, assert the explicit empty shape (`toStrictEqual({})`) instead — otherwise the test silently locks in the sparse-omit conflation bug.
