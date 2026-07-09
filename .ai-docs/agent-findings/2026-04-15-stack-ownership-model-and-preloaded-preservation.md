---
type: standard-gap
severity: high
affected_files:
  - src/cli/lib/configuration/config-generator.ts
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/configuration/config-merger.ts
  - src/cli/lib/matrix/matrix-provider.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-15
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: D-220 stack ownership + preloaded preservation shipped in 0.137.0
---

## What Was Wrong

`generateProjectConfigFromSkills` bucketed every selected skill by category and stamped that identical map onto every selected agent. The stack property then contained cross-domain contamination (e.g. `api-developer` carrying `web-framework-react`). Every save of `cc init` (scratch path) and `cc edit` re-corrupted the stack. Separately, `buildEjectConfig`'s stack-picked branch filtered skills but not agents, leaking unselected agents into the stack.

Two adjacent gaps surfaced during the fix:

1. **No domain-ownership primitive existed** for agents. `matrix-provider.ts` had `getCategoryDomain` but no `getAgentDomain` / `ownsCategory`, so every call site reinvented the string-splitting or consulted `matrix.agentDefinedDomains` directly with optional chaining.
2. **`preloaded` flags were hardcoded to `false`** in the generator. Preloaded is author-asserted via stack YAML at init time — the generator had no way to preserve it across subsequent edits, so running `cc edit` silently demoted every preloaded skill.

## Fix Applied

Added agent-domain primitives to `matrix-provider.ts`:

- `getAgentDomain(agent)` — explicit metadata first (`matrix.agentDefinedDomains`), agent-name prefix fallback
- `ownsCategory(agent, category)` — same domain OR category lives in a cross-cutting domain (`meta` / `shared` / `infra`)

Extended `getCategoryDomain` with a matching prefix fallback so unit-test matrices that don't populate `matrix.categories[*].domain` still resolve correctly.

Rewrote `generateProjectConfigFromSkills` as a mutator with preloaded preservation:

- Accepts an optional `existingStack` parameter
- For each (agent, category, skill) triple: includes iff agent is selected AND skill is non-excluded AND agent is non-excluded AND `ownsCategory(agent, category)` AND scope-compatible (project skill → skip global agents; global skill → any agent)
- Inherits `preloaded: true` only when the same triple existed in `existingStack`, defaulting to `false` for new pairs
- Re-runs cleanly on every save: removed skills/agents disappear, added ones appear, preloaded flags survive untouched

Threaded `projectDir` through `buildEjectConfig` → loaded existing stack via `loadProjectConfig` → passed as `existingStack` to the generator. Added the agent filter to the stack-picked branch (Bug 2 fix). Changed `mergeConfigs` stack behavior to "new wins" — the mutator already folded existing in via `existingStack`, so union-merging would only reintroduce stale contamination; existing stack is preserved only when the new config has no stack at all.

Added 10 new contract tests covering ownership boundaries, cross-cutting domain application, scope filtering (project skill + global agent), excluded agent/skill pruning, preloaded inheritance, preloaded default, skill/agent pruning from existingStack, and round-trip idempotence.

Updated legacy integration tests that encoded the old "every skill → every agent" contamination to assert ownership semantics. Added a helper tweak to `buildWizardResultFromStore`: when every agent in store is global-scoped (which `preselectAgentsFromDomains` produces), synthesize skills at global scope too — without this the scope filter correctly rejects the test setup's project-scoped skills on global agents, producing empty stacks and masking the real assertion intent.

## Proposed Standard

Add to `.ai-docs/reference/features/configuration.md` (stack-property section):

> **Stack generation invariants.** The `stack` property is a pure function of: existing saved stack + current wizard selection. On every save:
>
> 1. `(agent, category, skill)` triples appear iff agent is selected AND skill is non-excluded AND `ownsCategory(agent, category)` AND scope-compatible
> 2. `preloaded` flags inherit from the existing saved stack; new triples default to `preloaded: false` — never auto-set to `true`
> 3. `mergeConfigs` treats `newConfig.stack` as authoritative; existing stack is preserved only when `newConfig.stack` is `undefined`

Add to `.ai-docs/reference/type-system.md` (matrix helpers):

> Use `getAgentDomain(agent)` and `ownsCategory(agent, category)` from `matrix-provider.ts` for agent-domain decisions. Do not reinvent prefix parsing or consult `matrix.agentDefinedDomains` directly — those helpers already encode the explicit-first-then-prefix precedence and the cross-cutting-domain rule.
