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
superseded_by: 2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack.md
status: superseded
---

# New-agent toggle defaults to global scope, silently strips project skills

**Date**: 2026-04-20
**Area**: `src/cli/stores/wizard-store.ts` (applyAgentToggle) ↔ `src/cli/lib/configuration/config-generator.ts` (isScopeCompatible)
**Severity**: High — breaks D-220 Scenario C: "new agent added this session seeds from ownership defaults"

> **Note:** This finding is an earlier, less-formatted draft of the same root cause documented more rigorously in [`2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack.md`](./2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack.md). Kept for historical context; the sibling file is authoritative.

## Anti-pattern

`applyAgentToggle` (wizard-store.ts line 147) unconditionally adds newly-selected agents with `scope: "global"`. Combined with `isScopeCompatible` in `config-generator.ts` (a project skill can never reach a global agent), every project-scoped skill is silently filtered out when seeding the new agent's stack.

In editable projects where skills default to `scope: "project"` (the normal case — see `ProjectBuilder.editable` and the project-config write path), toggling a new agent ON produces:

1. `agentConfigs: [{name: "api-developer", scope: "global"}]`
2. `isScopeCompatible("web-framework-react" (project), "api-developer" (global))` → `false`
3. `buildAgentStack` produces empty `StackAgentConfig`
4. Agent key is omitted from the stack entirely
5. E2E assertion `stack["api-developer"]` at line 354 is `undefined`

## Why it's silent

No warning is logged when scope mismatch drops every candidate skill. The seeding branch in `shouldIncludeTriple` runs (agent is absent from `existingStack` → treated as new), but the `isScopeCompatible` filter runs before the triple check, so zero skills survive to be seeded.

## Candidate fixes

**Fix A (wizard-store)**: Default new-agent scope to `"project"` to match the project's skill default, mirroring `createDefaultSkillConfig`. Change line 147 to `{ name: agent, scope: "project" as const }`. Risk: may break scenarios where a user expects global by default; verify against `e2e/lifecycle/agent-scope-toggle-agents-array.e2e.test.ts` and `global-agent-propagation-type-consistency.e2e.test.ts`.

**Fix B (wizard-store, context-aware)**: Derive the default scope from the currently-installed project — look at `state.skillConfigs` or `state.agentConfigs` majority scope, or `state.isEditingFromGlobalScope`. Most aligned with the existing `isEditingFromGlobalScope` pattern.

**Fix C (config-generator)**: Downgrade the scope filter from a hard drop to a warning when seeding a new agent. Rejected: violates "never silently widen scope" and changes semantics for existing callers.

Recommended: **Fix A** (simplest, matches the symmetric skill default on line 162 of the same file where new skills use `"global"` fallback only when no `saved?.scope` exists — but for agents the "saved" concept doesn't apply, and a fresh add of a project-context agent should be project-scoped). Audit first: run the two e2e specs listed above to confirm no regression.

## Related findings

- `2026-04-17-d224-ptog-tombstone-not-cleared.md` — symmetric toggleSkillScope invariant issue
- `2026-04-17-merger-authoritative-for-names-semantic.md` — merge semantics for scope changes
