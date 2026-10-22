---
type: anti-pattern
severity: low
affected_files:
  - packages/compile/src/config-source.ts
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: typescript
domain: shared
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Code side landed 2026-10-21 in packages/compile/src/config-source.ts. The behavioural test (two
  global skills and two global agents, one of each tombstoned) and the clean-code-standards.md 7.2
  sentence proposed below are not written.
---

## What Was Wrong

`extractConfigArrays` in `packages/compile/src/config-source.ts` cast a config's `skills` and
`agents` to `unknown[]` at the JSON round trip, so every reader cast again: `isExcluded`, `idOf`
and `nameOf` each held `(entry as { … }).field` under a `// Boundary casts:` comment. Those casts
sat downstream of the boundary, so an accessor applied to the wrong array type-checked.

That stayed harmless while each accessor appeared twice per array (once to build the tombstone set,
once to filter the globals): a swap at one site left the tombstoned entry unmasked, which the
inlined-global spec catches. On HEAD's form (`git archive HEAD packages/compile`), each of the four
single-site swaps gives `Tests 1 failed | 389 passed (390)`. An expressive-ts round folded both uses into one argument,
`maskedByTombstones(entries, tombstones, keyOf)`. A swapped `keyOf` is now consistent: every key
reads `undefined`, so every global entry is masked. The fixture, `FULL_GLOBAL` in
`config-source.test.ts`, holds one global skill and one global agent and tombstones both, so
"masks all" and "masks the tombstoned one" give the same bytes.

Reproduction, on an isolated copy of the package (node_modules symlinked to the root's), before
the fix: replacing `idOf` with `nameOf` in the `globalSkills` call, or `nameOf` with `idOf` in the
`globalAgents` call, gives `tsc --noEmit` exit 0 and `vitest run` `Tests 409 passed (409)` for each.

## Fix Applied

The boundary cast now names the real type, `SkillConfig[]` and `AgentScopeConfig[]` (the cleaned
record is the JSON round trip of a `ProjectConfig`). The three accessors take typed entries with no
cast, and `maskedByTombstones` is generic over `Entry`. The same two swaps now fail `tsc --noEmit`
(exit 2, TS2322 and TS2345 at the `globalSkills` / `globalAgents` call). `vitest run` still reports
`409 passed` for both, because Vitest strips types: a hand-mutation runner judging only by Vitest
reports this mutant as surviving, and only `tsc` kills it.

Census of the shape in the compile package, non-test, non-generated:
`grep -rn --include='*.ts' -E '\(\w+ as \{' packages/compile/src | grep -v '\.test\.ts' | grep -v '/generated/'`.
Before: 4 hits, the three accessors plus `isSkillAssignment`'s probe. After: 1, the probe, which is a
type guard over a genuinely unknown value and stays.

## Proposed Standard

`clean-code-standards.md` 7.2 already rejects mid-pipeline casts. Add one sentence under it: cast
once, at the boundary, to the narrowest true type. Casting to `unknown` there and again in each
accessor moves every cast mid-pipeline, where an accessor applied to the wrong collection compiles.
No conflict with `CLAUDE.md`: this is the "Only cast at parse boundaries" rule, applied to where
the cast lands.

For hand mutation in this repository, run `tsc --noEmit` alongside `vitest run`. A mutant the
compiler refuses is killed, whatever Vitest reports.
