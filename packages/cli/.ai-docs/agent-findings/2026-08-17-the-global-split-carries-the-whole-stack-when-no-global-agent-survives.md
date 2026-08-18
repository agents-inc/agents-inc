---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/configuration/config-generator.ts
  - src/cli/lib/config-gate/propagate.ts
standards_docs:
  - .ai-docs/reference/config/scope-split.md
date: 2026-08-17
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `splitConfigByScope` in `src/cli/lib/configuration/config-generator.ts` now emits
  `stack: globalStack` on the global partition and `stack: projectStack` on the project
  partition, both unconditionally, so the undivided `...config` spread underneath can no longer
  reach either one. That is the one-line change this finding's Proposed Standard specified, and
  the writer concern it identified was placed where the finding said it belonged: the code
  comment records that `generateConfigSource` omits an empty stack from the emitted file, so
  nothing writes `stack: {}` on this account and an empty derivation is said as `{}` rather than
  inherited. The invariant the finding asked `reference/config/scope-split.md` to state is not
  written there; the doc still says "Empty stack objects are elided from the partition entirely
  (`stack: undefined`)", which describes the pre-fix shape of the in-memory partition. Reported
  rather than corrected here — that file is outside this pass's write scope.
---

## What Was Wrong

`splitConfigByScope` builds the global partition as `{ ...config, ...(globalStack non-empty && { stack: globalStack }) }`.
The `stack` override is CONDITIONAL, and the spread underneath it is not — so when the split
produces **no** global stack rows, `stack` falls through from the whole project config and the
global partition carries every PROJECT-scoped sub-agent's rows.

The condition is reachable exactly when the config has no active global sub-agent, which is the
ordinary shape of a project that owns its own agents and inherits only skills. The global stack
loop iterates `globalAgents`; with none, `globalStack` is `{}` and the guard declines to override.

Observed in a hand-run of `edit --from` in a project against a real global installation: after the
run, `~/.claude-src/config.ts` held

```
stack: { "web-developer": { "web-framework": "<a project-scoped skill id>" } }
```

naming a project-scoped sub-agent and a project-scoped skill, neither of which the global
installation declares in `agents` or `skills`.

**This is pre-existing and was merely made visible by CLI-519, not introduced by it.** Before that
change the project branch of the gate merged the leaked stack through
`mergeGlobalConfigs` -> `additiveMergeStack`, which appends every incoming `(agent, category, skill)`
triple and filters none — so the same rows reached the same file by a different route, on every
ordinary project `init` and `edit`. CLI-519's authoritative path replaces the global stack instead
of unioning into it, so the leak is now the whole of what lands rather than an addition to it. Both
are wrong in the same direction; neither is worse than the other.

Nothing downstream reads it as authority — `compile` warns about a stack row naming a sub-agent the
config does not install and leaves it out of the agents it writes — so the damage is a global config
that describes a project, not a mis-compiled agent. It is still a file two commands disagree about:
`share` and `edit --ui` mint a payload from `loadProjectConfig`, and a stack row for a sub-agent the
config does not declare is a row `configToSeedPayload` drops on the way out.

## Fix Applied

None — discovery only. CLI-519's scope is the ruling on global removal through `edit --from`, and
repointing `splitConfigByScope` reaches every producer of an installation: `init`, both `edit`
producers, and the propagation writer. The E2E fixtures that snapshot `~/.claude-src/config.ts`
would all move with it, which is a task rather than a footnote to this one.

## Proposed Standard

`reference/config/scope-split.md` documents the partition rules for `skills` and `agents` and
describes stack routing per agent. It should state the invariant the code does not enforce:

> **The global partition holds only what the global partition declares.** A stack row under a
> sub-agent absent from `global.agents` does not belong in the global config, whether the row
> arrived through the per-agent loop or through the object spread the loop's result conditionally
> overrides. `stack` on the global split is derived, never inherited.

The code change the standard implies is one line: emit `stack: globalStack` unconditionally on the
global partition (dropping the `Object.keys(...).length > 0` guard), so an empty global stack is
written as empty rather than as the project's. The guard exists to keep `stack` absent rather than
`{}` in the emitted config; that is a writer concern and `generateConfigSource` already compacts
empty structures, so the guard belongs there if it belongs anywhere.
