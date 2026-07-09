---
type: anti-pattern
severity: high
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/configuration/config-merger.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-04-17
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: D-224 P→G tombstone cleanup shipped in 0.138.0
---

## What Was Wrong

When writing E2E tests for D-224 ("Wizard hides global install state after P→G
toggle when a prior tombstone existed"), the red-phase failure revealed that
the observed bug is more severe than the plan's hypothesis.

Hypothesis in `todo/D-224-wizard-hides-global-after-PtoG-tombstone.md`:

> The written project config ends up with TWO global entries for the same id:
> `[{id:"react", scope:"global"}, {id:"react", scope:"global", excluded:true}]`.

Actual observed state in red-phase run (on current `main`, 2026-04-17):

> The written project config ends up with exactly ONE entry for the id:
> `{id:"web-framework-react", scope:"global", source:"eject", excluded:true}`.
> The active entry produced by `toggleSkillScope` does not survive the write
> pipeline — only the tombstone does.

The merger in `config-merger.ts::mergeConfigs` keys skills by compound key
(`s.excluded ? "${id}:excluded" : id`), so the active+tombstone pair land at
separate keys. But at some point downstream (likely
`config-generator.ts::generateProjectConfigFromSkills` or
`splitConfigByScope`), the active entry for the same (id, scope) gets dropped
while the excluded entry survives — producing an effectively uninstalled-at-
global-scope skill.

This matters because it changes the fix surface: a writer-side invariant in
`mergeConfigs` that "drops excluded when a same-scope active exists for the
same id" would not suffice alone if the active entry is already gone by the
time merge runs.

## Fix Applied

None — discovery only. The D-224 plan's test surface is correct; this finding
is a datapoint for the implementing agent (cli-developer) to trace the WRITE
pipeline more carefully in addition to the STORE-layer `toggleSkillScope` fix.

## Proposed Standard

Update `todo/D-224-wizard-hides-global-after-PtoG-tombstone.md` "Confirmed
root cause" section with this empirical note: the symptom is ONE tombstone
entry, not a pair. Recommend the D-224 implementing agent add a log/trace at
each hop (wizard-store -> wizard.tsx::handleComplete -> config-generator ->
config-merger -> config-writer) to pin down exactly where the active entry is
discarded. The existing investigation `03-config-merge.md` traced the pair
through the merger correctly in theory, but the empirical single-entry
outcome suggests the active entry is being dropped upstream of the merger —
probably in the `activeSkillIds` / `skillScope` map construction in
`config-generator.ts::generateProjectConfigFromSkills`.
