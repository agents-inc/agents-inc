---
type: standard-gap
severity: high
affected_files:
  - e2e/lifecycle/project-only-agent-to-global-drops-project-skill.e2e.test.ts
  - src/cli/lib/configuration/config-generator.ts
  - src/cli/lib/installation/local-installer.ts
  - src/cli/base-command.ts
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/user-journeys.md
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-19
reporting_agent: codex-keeper
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  The instance was corrected before the spec landed. Its author mutated all three enforcement
  points in turn and wrote the cumulative result into the spec's own JSDoc, naming which
  assertion carries the red for each layer, so nobody can simplify the file down to the
  filesystem assertions and still believe it guards the function the spec is named after. Row 16
  of standards/e2e/user-journeys.md now states the same three-layer result, because a coverage
  row that reads "this journey is proved" over an assertion set that survives the mutation is
  the claim this page exists to hold. The generalisation below is a proposal — the mutation-check
  rule in standards/e2e/README.md has not been widened to require it.
---

## What Was Wrong

A spec was commissioned to prove `isScopePairCompatible` — the one-line rule in
`src/cli/lib/configuration/config-generator.ts` that keeps a project-scoped skill off a
global-scoped sub-agent. It was written as
`e2e/lifecycle/project-only-agent-to-global-drops-project-skill.e2e.test.ts`, and mutation-checked
the way [README.md § Mutation-check every regression guard](../standards/e2e/README.md) requires:
defeat the thing, rebuild, watch it go red.

The function was mutated to `return true`. **Every filesystem and config assertion stayed green.**
The install produced identical bytes at both scopes; the compiled agent still had no trace of the
project-scoped skill; the global config's `stack` was unchanged. The only assertions that reddened
were the two output sentinels — and they reddened by going SILENT, because the run had nothing to
warn about any more.

Two further layers keep a project skill out of a global sub-agent independently, and each had to be
defeated in turn before anything else moved:

| Layer | Where                                                                                                   | What it does                                                                  | What reddens once it falls  |
| ----- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------- |
| 1     | `isScopePairCompatible`, the first filter in `buildAgentStack` (`config-generator`)                     | Never builds the assignment                                                   | The two warnings, only      |
| 2     | `splitAgentStack`'s partition (`config-generator`)                                                      | Routes a project-scoped assignment to the project partition, never the global | The global config's `stack` |
| 3     | `buildCompileAgents`' `agentConfig.scope !== "global" \|\| globalSkillIds.has(...)` (`local-installer`) | The compile-time cross-scope net                                              | The compiled agent's body   |

The mutations are cumulative: layer N is only observable once layers 1..N−1 are already defeated.

**The warnings are red under layer 1 for a reason that is not obvious, and it is what makes them
load-bearing.** `reportUnassignedSkills` on `BaseCommand` does not consult the scope rule at all —
`findUnassignedSkills` reads the SAVED config's `stack` and reports every active skill no sub-agent
carries. Defeating layer 1 puts the assignment into that stack, so the skill is no longer
unassigned and both sentences vanish. The warning is therefore the only surface in the whole run
that observes layer 1's decision rather than the downstream layers' identical answer — and read
cold it looks like the least important assertion in the file, a nicety about wording next to four
structural reads of disk and config.

## Fix Applied

None to the product — the three layers are all deliberate and the behaviour is correct and
owner-ruled. The spec's JSDoc records the cumulative mutation and what each layer's fall makes
red, and row 16 of `standards/e2e/user-journeys.md` records the same, so the coverage claim and
the spec agree about what is actually proved.

## Proposed Standard

For `.ai-docs/standards/e2e/README.md` § "Mutation-check every regression guard", as a third
mechanism beside the two already there (the fixture is smaller than production; the subject is
not painted in the captured frame):

**3. The rule is enforced at more than one layer, so defeating the named one changes nothing
observable.** An assertion on the final artefact proves the CONTRACT and proves nothing about any
single enforcement point. Where a spec's rationale names a function, the mutation is applied to
THAT function — not to whatever produces a red — or the spec is testing defence in depth while
silently attributing it to one line. When the named function's mutation leaves everything green,
say so and keep mutating outward, recording the order: the layers are cumulative, and the write-up
is the only thing that stops a later reader deleting the one assertion that carries the red.

**The corollary is the more useful half. The layer whose red is the only red tells you which
assertion is load-bearing for that layer**, and it is routinely the assertion that reads as
decorative — a warning line, a count, a heading. That is the same conclusion
[anti-patterns.md § Never call a spec a regression guard until you have watched it go red](../standards/e2e/anti-patterns.md)
already reached from the fixture-size direction, where the assertion matching the reported symptom
passed against the unfixed binary and an unrelated-looking positive was what went red. Two
different causes, one instruction: record which assertion carries the red, per mutation.

This is a widening rather than a new rule, and it does not conflict with anything in CLAUDE.md.
It is adjacent to but distinct from README.md's "A verdict is judged on the specific signal that
answers its question, never on a coarser one that a failure also produces" — that rule is about
one check reading too coarse a signal; this one is about several correct checks all answering
before the one under test gets a turn.

The three layers are a census of this rule's enforcement points on the install path, not a sample
— and the sharpest fact about them is that **only ONE of the three calls the named function.**
`splitAgentStack` partitions on `globalSkillIds.has(assignment.id)`, and `buildCompileAgents` on
`agentConfig.scope !== "global" || globalSkillIds.has(ref.id)`; both restate the rule as membership
of the global skill-id set, and neither calls `isScopePairCompatible`.

**That is why a caller census cannot be substituted for the mutation run, and the near-miss is
worse than a plain absence.** Grepping the name returns four modules. Two are off the install path
(`seed/config-to-seed.ts`, `seed/seed-to-wizard.ts`). The third is `config-generator.ts` itself,
where `isScopeCompatible` wraps it for `buildAgentStack` — layer 1. And the fourth is
`installation/local-installer.ts`, which is the module holding layer 3 and imports the function for
something else entirely: `computeScopeEligibilityGained`, which asks which `(agent, skill)` pairs
GAINED compatibility this session. So the grep lands a reader in the right file at the wrong
function, and `buildCompileAgents` — the layer that actually keeps the skill out of the compiled
agent — is reachable from the name by nothing at all. Where a rule has one named definition and
unnamed restatements downstream, the census is of BEHAVIOUR, and only mutating takes it.
