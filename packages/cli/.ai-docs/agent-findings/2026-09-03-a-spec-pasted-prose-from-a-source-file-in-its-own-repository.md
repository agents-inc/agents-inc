---
type: standard-gap
severity: low
affected_files:
  - scripts/generate-matrix-package.test.ts
standards_docs:
  - .ai-docs/standards/e2e-testing-bible.md
date: 2026-09-03
reporting_agent: cli-tester
category: testing
domain: infra
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Both instances are fixed — `AGENT_SUMMONER_ENTRY` and `PM_ENTRY` now read every value from the
  agent's own `metadata.yaml` through one `agentDefinitionEntry` function, so a reworded
  description cannot redden them again, and the census below found no third site. What is still
  open is the RULE: CLAUDE.md's binding rule under "Test Assertions" has no row for data copied
  from a source file inside this repository, and its "keep the literal" clause is what the pasted
  form could be argued from. CLAUDE.md was not this pass's lane.
---

## What Was Wrong

`scripts/generate-matrix-package.test.ts` spot-checks the generated `AGENT_DEFINITIONS` entries for
two agents. Both expectations were pasted literals, each carrying a full copy of the agent's
`description` sentence — a 250-character paragraph of prose whose only home is
`src/agents/<flavor>/<agent>/metadata.yaml`.

`agent-summoner`'s description was reworded this session (the trailing clause naming `isolation` was
dropped, since isolation is decided by the project asking for a worktree and never from the role).
The generator carried the new wording, `packages/matrix/src/generated/agents.ts` was regenerated to
match, and the spec was left asserting a sentence no file in the repository contained.

The census is one grep and it returned one file — the two constants in it, no third site:

```
grep -rln "Expert in creating and improving Claude Code sub-agents\|Creates implementation specs for any feature" --include='*.ts' --include='*.tsx' src e2e scripts
```

`PM_ENTRY` was the sibling: identical shape, green only because `pm`'s wording had not moved yet.

**The cost was not the red test — it was the misreading.** A failure whose diff is two long prose
sentences differing by one clause reads as generated-file drift, and this agent reported it in
exactly those terms: as another lane mid-edit rather than as an expectation it now owned. A
value-shaped failure hides which side is stale.

## Fix Applied

Both constants now come from one `agentDefinitionEntry(flavor, agent)` that reads the agent's
`metadata.yaml` and builds the expected block from it. The seven fields stay spelled out one per
line — the FIELD ROSTER is what these two tests are named for, and a loop would state it nowhere —
but every value is read rather than restated.

Deriving an expectation from the same file the code under test reads risks a tautology, so
non-vacuity was demonstrated rather than assumed: with the generator pointed at a copy of `src/`
whose `agent-summoner` description had been replaced, the expectation built from the real source
stopped matching (`false`) and the one built from the mutated source matched (`true`). The
comparison discriminates on exactly the dimension it claims.

What that keeps, and a keys-only assertion would have given up, is PROVENANCE — a generator
carrying the right seven keys with a value of its own invention fails here. Byte-identity against
`packages/matrix`, the neighbouring test, cannot make that catch: regenerating rewrites the
committed file, so both sides of that comparison move together.

## Proposed Standard

**The gap.** CLAUDE.md's binding rule under "Test Assertions" ends: _"bind when the literal names a
SYMBOL whose deletion should break the test (a `SkillId`, an `AgentName`), because deletion is then
a compile error; keep the literal when it is TEXT the product renders."_ That dichotomy has two rows
and this case is in neither. An agent's `description` is not a symbol, and it is not text the
product renders whose wording a test should independently mirror — it is DATA copied by a generator
from a source file in the same repository. Read against the two rows available, "prose" resolves to
"TEXT the product renders" and the pasted form is what the rule appears to ask for.

**The proposed third row:** where the expected value is data this repository's own source files
declare, READ it from that file. It is neither a symbol to bind nor rendered text to mirror, and the
reason the mirroring argument does not apply is that there is no independent authority to mirror —
`e2e/pages/constants.ts` mirrors product strings so the test and the product cannot move together,
whereas here the source file IS the authority and moving with it is correct.

**Where it goes:** CLAUDE.md's "Test Assertions" block, as a clause on the existing rule rather than
a new rule — it is a third row on a dichotomy that already exists, and splitting it out would leave
two rules to consult about one decision.

**Cross-checked** against CLAUDE.md's NEVER/ALWAYS rules. It does not conflict with the
rendering-assertion half, which it explicitly carves around. It is consistent with "NEVER construct
test data inline — use factories" and with "ALWAYS grep for the old value when changing test data",
whose own census would have caught this had a rename sweep been run for the reworded clause.
