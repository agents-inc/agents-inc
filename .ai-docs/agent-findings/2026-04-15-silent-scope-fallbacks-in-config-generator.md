---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/configuration/config-generator.ts
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/__tests__/factories/config-factories.ts
standards_docs:
  - CLAUDE.md (Data Integrity)
date: 2026-04-15
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: getScopeOrThrow replaces null-coalescing in config-generator.ts
---

## What Was Wrong

`generateProjectConfigFromSkills` used `?? "project"` null coalescing when looking up
skill and agent scope from `skillScope` / `agentScope` maps:

```ts
const sScope = skillScope.get(skillId) ?? "project";
const aScope = agentScope.get(agent) ?? "project";
```

This violated CLAUDE.md's "NEVER use null coalescing on data that must exist" rule
and masked a Bug 1-class latent regression: the stack-picked `buildEjectConfig`
path only passed `agentConfigs` when `wizardResult.agentConfigs.length > 0`. If
the wizard produced an empty `agentConfigs` array for any reason (test factory
default, wizard state glitch, serialization quirk), every selected agent would
silently resolve to `"project"` scope — producing cross-scope contamination on
dual-scope stack-picked init without any warning.

`buildWizardResult` factory defaulted `agentConfigs: []` even when callers passed
`selectedAgents`, letting the invariant "every selected agent has a config" drift
in tests.

## Fix Applied

1. Replaced `?? "project"` with an asserting lookup (`getScopeOrThrow`) that
   throws with a descriptive error when a skill or agent is missing from its
   scope map.
2. Added an entry-level invariant check in `generateProjectConfigFromSkills`:
   when `selectedAgents` is non-empty, both `skillConfigs` and `agentConfigs`
   MUST be passed. Violations throw.
3. Removed the `wizardResult.agentConfigs.length > 0 &&` gate at
   `local-installer.ts:206-208`. Production now always passes both
   `skillConfigs` and `agentConfigs` through.
4. `buildWizardResult` factory now auto-synthesizes `agentConfigs` from
   `selectedAgents` via `buildAgentConfigs(selectedAgents)` when callers do
   not pass it explicitly. Tests that verify mismatch behavior can still
   override `agentConfigs` directly.
5. Updated ~18 test call sites in `config-generator.test.ts` and
   `project-config.test.ts` that passed `selectedAgents` without the
   corresponding `skillConfigs` / `agentConfigs`.
6. Renamed `inheritPreloaded` → `wasPreviouslyPreloaded` (returns boolean,
   should read as a getter per expressive-typescript skill).

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md` (or the closest data-integrity
section):

> **Scope map lookups must assert**. When a function takes a list of keys
> plus a `Map<K, Scope>` built from a config array, the map lookup must either
> (a) assert the key is present with a throwing helper, or (b) fail a typed
> invariant at the call boundary — never fall back to a default value. Silent
> `?? "project"` / `?? "global"` defaults mask caller bugs that only surface as
> cross-scope data corruption at write time.

> **Factories must enforce their own invariants**. When a factory builds a
> composite object (e.g. `WizardResultV2`), any field that must stay in sync
> with another field (`agentConfigs` ↔ `selectedAgents`) should be auto-
> synthesized by the factory unless the caller explicitly overrides. Default
> empty arrays silently violate invariants that production code enforces.
