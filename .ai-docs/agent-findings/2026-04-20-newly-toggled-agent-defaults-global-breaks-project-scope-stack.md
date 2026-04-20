---
type: anti-pattern
severity: high
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/configuration/config-generator.ts
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-04-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
---

## What Was Wrong

`toggleAgent` in `wizard-store.ts` hard-codes `scope: "global"` for every newly-added agent (`applyAgentToggle`, else-branch). There is no consideration of the surrounding project's scope convention. In an edit flow where the project is entirely project-scoped (skills + existing agents), toggling on a NEW agent produces a global-scoped agent in a project-scoped world.

Downstream, `config-generator.ts::isScopeCompatible` enforces "project skills never reach global agents". A newly-selected agent therefore receives ZERO stack assignments, so `buildAgentStack` returns undefined and `stack[newAgent]` is never emitted. This breaks the explicit D-220 contract (test E2E `stack-per-agent-curation.e2e.test.ts`) that a newly-selected agent must seed from ownership defaults.

Separately, there is no wizard-store unit test asserting `toggleAgent` scope selection when `installedAgentConfigs` or existing skills are project-scoped — the gap that allowed this regression in.

## Fix Applied

None — investigation only.

## Proposed Standard

Two complementary rules belong in a new "Wizard scope defaults" section (add to `.ai-docs/standards/cli/wizard-conventions.md`, or analogous CLI standards doc):

1. **Newly-toggled agents must inherit scope from the dominant scope of existing non-excluded `agentConfigs`.** Specifically: if every existing active entry has `scope: "project"`, new agents should default to `"project"`; otherwise `"global"`. A fresh init with zero agents continues to default to `"global"`.

2. **When skill configs are entirely project-scoped in edit mode, new agents must not be global-scoped.** Equivalent to rule 1 expressed against skills — pick whichever side is more natural to maintain.

Wizard-store unit tests must cover: (a) toggleAgent ON in edit mode with existing project-scoped `agentConfigs`; (b) toggleAgent ON in edit mode with only project-scoped `installedSkillConfigs`. Assertion target: the new agent's `scope` in `agentConfigs`.

Config-generator should also emit a `verbose` log when `buildAgentStack` returns undefined due to 100% scope-incompat filtering — that would have flagged this during development.
