---
type: architectural-drift
severity: high
affected_files:
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/configuration/config-writer.ts
  - e2e/lifecycle/project-tracking-propagation.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-18
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  cli-developer added computeRemovedGlobalSkillIds + retainReconciledStack in
  local-installer.ts; propagateGlobalChangesToProjects now reconciles projectSplit.stack
  against the now-current global data, pruning only stack references to global skills
  that were just removed (project-owned and local skills untouched). Confirmed-red test
  edit-global-propagation-stale-stack-ref.e2e.test.ts converted from it.fails to it and
  is green. The secondary compiled-agent-.md recompile gap is tracked separately in
  2026-07-18-propagation-skips-agent-recompile.md.
---

## What Was Wrong

`propagateGlobalChangesToProjects` (`local-installer.ts`) rewrites each registered
project's `config.ts` when a global skill/agent is removed via `cc edit` at global
scope. It builds `projectSplit = { ...projectConfig, skills: retainReconciledSkills(...),
agents: retainReconciledAgents(...) }`. Those two reconcilers filter `skills[]` and
`agents[]` only — they never touch `.stack`, which is carried forward verbatim via the
`...projectConfig` spread. The inlined writer (`generateProjectConfigWithInlinedGlobal`
in `config-writer.ts`) then filters the stack down to project-scoped agent names but
does NOT validate that referenced skill ids still exist at any scope.

Result: when a project-scoped agent's stack references a globally-installed skill and
that skill is removed at global scope, the project's `skills[]` correctly drops the
skill (via `retainReconciledSkills`) but the project agent's `stack` retains a dangling
reference to it. The `buildStackForSelection` `{}`-not-`undefined` fix cleans the GLOBAL
config's own stack, but propagation to registered projects is a separate write path the
fix does not reach.

Confirmed via a real E2E run (`edit-global-propagation-stale-stack-ref.e2e.test.ts`):
after removing the global `web-framework-react`, `project-a`/`project-b`
`config.ts` show `skills: []` (react dropped — proves propagation ran) but
`stack["api-developer"]["web-framework"]` still equals
`[{ id: "web-framework-react", preloaded: false }]`.

Secondary observation: propagation calls only `writeConfigFile` + `regenerateConfigTypes`.
It does NOT recompile agents — a registered project's compiled `.claude/agents/<name>.md`
is never regenerated during propagation, so a removed skill can also linger in already-
compiled agent markdown until the project is edited/compiled directly.

Tertiary observation: the `KNOWN GAP` comment in
`project-tracking-propagation.e2e.test.ts` (the commented-out
`expect(projectTypesAfter).not.toStrictEqual(projectTypesBefore)` block) claims
`mergeConfigs` drops the global `projects` field on edit-at-HOME so propagation never
runs. That is now STALE: `mergeConfigs` preserves `projects`
(`config-merger.ts`, `existingConfig.projects && !newConfig.projects` branch), so
propagation DOES run on a global edit — which is exactly what makes the stack-reconcile
gap reachable and observable.

## Fix Applied

Code fix landed (cli-developer). In `local-installer.ts`:

- Added `computeRemovedGlobalSkillIds(priorProjectSkills, globalConfig)` — derives the
  skill ids that were inherited into a project from global scope (present in the loaded,
  pre-reconciliation `projectConfig.skills` as active `scope: "global"` entries) but are
  no longer active in the now-current `globalConfig`, and that the project does not own
  at project scope. This keys on the pre-reconciliation skills precisely because
  `retainReconciledSkills` drops the removed global entry before we could observe it.
- Added `retainReconciledStack(stack, removedGlobalSkillIds)` — prunes only assignments
  whose id is in that set; every other assignment is kept verbatim, in order, with its
  `preloaded` flag intact. Empty categories/agents are dropped; when nothing was removed
  the stack object is returned unchanged so unaffected projects emit byte-identical
  config. Project-scoped skills and user-authored local skills (which carry no
  `SkillConfig`) are never pruned.
- `propagateGlobalChangesToProjects` now sets `stack: retainReconciledStack(...)` on
  `projectSplit`.

Regression coverage (previously red, now green):

- `edit-global-propagation-stale-stack-ref.e2e.test.ts` — proof-of-execution test +
  the former `it.fails` (now `it`) asserting the dangling reference is gone.

Scenarios 1, 3, 4 (project-scope removal, dual-scope partial removal, surgical
multi-category removal) remain green, confirming both the direct-edit
`buildStackForSelection` fix and the propagation-path fix are surgical.

## Proposed Standard

Code fix (cli-developer): `propagateGlobalChangesToProjects` must reconcile `.stack`
alongside `skills[]`/`agents[]` — drop any stack assignment whose skill id is neither an
active global skill in the new `globalConfig` nor an active project-scoped skill the
project still owns. Consider whether propagation should also recompile affected project
agents so compiled `.md` files don't retain removed skills.

Doc/standard: the stale `KNOWN GAP` comment in
`project-tracking-propagation.e2e.test.ts` should be revisited now that `mergeConfigs`
preserves `projects` — the commented `not.toStrictEqual` proof-of-execution assertion is
now assertable. Add a note to `.ai-docs/standards/e2e/README.md` under
"Prove the code path fired" that when a propagation guard is unblocked (its precondition
now met on `main`), previously-commented `// KNOWN GAP:` proof assertions must be
re-audited and either activated or re-justified, since a `KNOWN GAP` predicated on a
since-fixed upstream bug silently hides reachable behavior.
