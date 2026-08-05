---
scope: reference
area: config
keywords:
  [
    scope-split,
    splitConfigByScope,
    scopeEligibilityKey,
    scopeEligibilityGained,
    computeNewlyAddedSkillIds,
    computeScopeEligibilityGained,
    SplitConfigResult,
    tombstone-routing,
    per-agent-curation,
    D-220,
    D-223,
    reconcileProjectSplitAgainstGlobal,
    splitAgentStack,
  ]
related:
  - reference/config/config-writer.md
  - reference/config/config-merger.md
  - reference/config/configuration.md
  - reference/concepts/scope-system.md
  - reference/concepts/tombstone-pattern.md
last_validated: 2026-07-30
---

# Config Scope Split Contract

> How a merged `ProjectConfig` is partitioned into global and project halves for writing, and the delta sets the stack builder consumes for per-agent curation preservation. Feeds `mergeGlobalConfigs` and the project config writer (see [config-writer.md](./config-writer.md), [config-merger.md](./config-merger.md)).

## The Two Split Surfaces

| Function | File | Purpose |
| ------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `splitConfigByScope` | `src/cli/lib/configuration/config-generator.ts` | Partitions a merged `ProjectConfig` into `{ global, project }` halves on `scope` + `excluded`. |
| `scopeEligibilityKey` | `src/cli/lib/configuration/config-generator.ts` | Encodes `(agent, skillId)` as `"${agent}                                                                               | ${skillId}"` for set-membership lookups in the stack builder. |
| `computeNewlyAddedSkillIds` | `src/cli/lib/installation/local-installer.ts` (private) | Diff: skill ids active in current config but not in prior. Feeds `generateProjectConfigFromSkills.newlyAddedSkillIds`. |
| `computeScopeEligibilityGained` | `src/cli/lib/installation/local-installer.ts` (private) | Diff: `(agent, skill)` pairs whose scope-compatibility flipped from incompatible to compatible this session. |

The delta helpers do not partition the config — they compute the sets that `shouldIncludeTriple` inside the stack builder consults. They live alongside `splitConfigByScope` in this doc because both are project-context pipeline plumbing between merger output and writer input.

## `splitConfigByScope` — Partition Rules

**Signature:** `splitConfigByScope(config: ProjectConfig): SplitConfigResult`
where `SplitConfigResult = { global: ProjectConfig; project: ProjectConfig }`.

Skills and agents are partitioned with `partition(list, e => isActiveAt(e, "global"))` from `scope-predicates.ts`: active-global entries go to the global half, everything else (project-scoped, plus excluded-global tombstones) goes to the project half.

### Skills

| Row in `config.skills`                 | Routed to                                    |
| -------------------------------------- | -------------------------------------------- |
| `scope === "global" && !excluded`      | global                                       |
| `scope === "global" && excluded`       | **project** (tombstone suppressing a global) |
| `scope === "project"` (any `excluded`) | project                                      |

### Agents

| Row in `config.agents`                 | Routed to                                      |
| -------------------------------------- | ---------------------------------------------- |
| `scope === "global" && !excluded`      | global                                         |
| `scope === "global" && excluded`       | **project** (project-level override of global) |
| `scope === "project"` (any `excluded`) | project                                        |

### Stack

The stack field is partitioned by the **agent** partition first, then each global agent's entries are further split per skill reference by the private helper `splitAgentStack(agentStack, globalSkillIds)` so global agents never carry project skill ids:

- **Global agent** → `splitAgentStack` inspects each `(category, assignments)` slot and `partition`s the assignments on `globalSkillIds.has(a.id)`. The global half lands under the agent in `globalStack`; the non-global half lands under the same agent in `projectStack`. Slots that end up empty on a side are omitted from that side.
- **Project agent** → the agent's entire stack entry is copied verbatim into `projectStack`. Project agents keep ALL skill references (both project and global) since global skills are available everywhere.

An agent is omitted from its partition's stack when no category slot survives (length 0 after filtering). Empty stack objects are elided from the partition entirely (`stack: undefined`).

`globalSkillIds` is derived from the post-partition global `skills` array — it contains ONLY active globals, so a tombstone for a global skill does not count as "global" when filtering stack entries. A global agent that referenced a now-tombstoned global skill will see that reference drop out of the global stack and reappear in the project stack (carrying the reference to the project side where the tombstone lives).

### Scalar / Array Fields

| Field            | Global split                                                                           | Project split                                                                   |
| ---------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `name`           | `"global"` (literal)                                                                   | `config.name` (preserved)                                                       |
| `domains`        | `config.domains` (copied)                                                              | `undefined` (project inherits at runtime)                                       |
| `selectedAgents` | names in the global agent partition, or `undefined` when that side is empty            | names NOT in the global agent partition, or `undefined` when that side is empty |
| everything else  | `...config` spread (descriptions, author, source, marketplace, agentsSource, projects) | `...config` spread                                                              |

The `...config` spread copies every remaining scalar/array to BOTH splits — including `projects`. The authoritative copy is in whichever split the caller writes. In practice the project branch of `writeScopedFromWizard` overwrites `effectiveGlobalConfig` from an `existing`-spread path, so the duplicated `projects` in `globalConfig` never reaches disk.

## Tombstone Routing Rationale

Excluded global entries (both skills and agents) route to the **project** split, not the global split. This is intentional and load-bearing:

- A tombstone (`scope: "global", excluded: true`) is a **project-level directive to suppress a shared global install for this project**. It is project-local state — other projects must not see it.
- **Provenance:** only two things create one. The `s` scope toggle (G→P), which pairs it with an active project entry (`[P][G]`); and a system-derived conflict mask synthesized at write time by `maskCollidingGlobalSkills` / `maskCollidingGlobalAgents`. Deselection is NOT a source — a project-scope deselect of a globally-installed item is refused by the wizard guards, so no route mints a tombstone by removal. See [concepts/tombstone-pattern.md](../concepts/tombstone-pattern.md).
- If tombstones routed to the global split, `mergeGlobalConfigs` would either ignore them (its `!excluded` guard — see [config-merger.md](./config-merger.md) `mergeGlobalConfigs` row) or worse, propagate a suppression that only this project intended.
- Routing them to the project split means the tombstone is inlined into `<projectDir>/.claude-src/config.ts` via `generateProjectConfigWithInlinedGlobal`, where it participates in the suppression rule documented in [config-writer.md](./config-writer.md) ("Excluded global entries replace their active global counterparts in the global section while the active project entry appears separately in the project section").

The tombstone routing is also what keeps one failure mode tractable: the symptom "only the tombstone survives the write pipeline" is isolated to either the merger (drops the active) or the generator (never emits the active), because the split itself routes tombstones cleanly (P→G tombstone-not-cleared).

## Interaction with `mergeConfigs` and `mergeGlobalConfigs`

Order in the `cc edit` project-context pipeline:

1. Wizard emits `newConfig` with dual-scope pairs when scope toggles produce tombstones.
2. `mergeConfigs(newConfig, existingProjectConfig, { authoritativeScope: "owned", unresolvableSkillIds })` reconciles via compound keys. `newConfig` is authoritative for every referenced name/id; under `"owned"` authority a project-owned entry that is absent from `newConfig` was deselected and is dropped (unresolvable skills exempt — see [config-merger.md](./config-merger.md)). Output: `finalConfig` carrying both active and tombstone rows where applicable.
3. `splitConfigByScope(finalConfig)` → `{ globalSplit, projectSplit }`. Active globals and active global agents to `globalSplit`; everything else (project, tombstones) to `projectSplit`.
4. `mergeGlobalConfigs(existingGlobalConfig, globalSplit)` is **additive** — existing wins, incoming only appends. `globalSplit` carries only actives, so no tombstones reach this call (which is why `mergeGlobalConfigs` does not need tombstone-handling logic).
5. The merger's output `effectiveGlobalConfig` is written to `~/.claude-src/config.ts`.
6. **`reconcileProjectSplitAgainstGlobal(projectSplit, effectiveGlobalConfig, matrix)`.** The project split is reconciled against the global config it is about to be inlined with: masks whose collision has cleared are dropped, and live global entries the project still collides with (same id at project scope, or a different project-owned skill in the same exclusive category) gain a fresh mask row. See [config-writer.md](./config-writer.md) → "Cross-Scope Reconciliation".
7. The **reconciled** project config is written to `<projectDir>/.claude-src/config.ts` with `globalConfig: effectiveGlobalConfig` passed to the writer so the inlined-global preamble reflects the merged global state.

**The split output is not what reaches the writer.** Step 6 sits between them and may ADD `{ scope: "global", excluded: true }` rows the split never produced. When reading an emitted project config, a global tombstone therefore has two possible provenances — the `s` scope toggle (which routes through steps 1–3 as a genuine split row) or the reconciliation step. Both look identical on disk; see the mask-lifetime rule in [config-writer.md](./config-writer.md).

Note: the split result is not re-merged. The global half feeds `mergeGlobalConfigs`; the project half is reconciled and written directly. `splitConfigByScope` is idempotent over already-split configs (a split of a split is a no-op on the same partition).

## `scopeEligibilityKey` — The Stack-Builder Set Key

**Signature:** `scopeEligibilityKey(agent: AgentName, skillId: SkillId): string` → `` `${agent}|${skillId}` ``

**Purpose:** produce a stable string key for set membership lookups against `scopeEligibilityGained: ReadonlySet<string>` in `shouldIncludeTriple` within `config-generator.ts`. Both inputs are string-literal unions so `|` is a safe delimiter.

**Where it's used:**

- Keys inserted: `computeScopeEligibilityGained` in `local-installer.ts` (one add per newly-compatible `(agent, skill)` pair).
- Keys queried: `shouldIncludeTriple` in `config-generator.ts` (scope-flip admission branch).

No caller parses these keys — they are opaque membership tokens. Changing the delimiter would require updating both sites; the shared helper guarantees they agree.

## The D-220 Delta Pipeline

`generateProjectConfigFromSkills` accepts two optional opt-in delta sets that govern per-agent stack curation:

| Parameter                | Produced by                     | Governs                                                                                                                                   |
| ------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `newlyAddedSkillIds`     | `computeNewlyAddedSkillIds`     | Skills new to this session (not in prior `existing.config.skills`). Admits them to every existing agent's stack that is scope-compatible. |
| `scopeEligibilityGained` | `computeScopeEligibilityGained` | `(agent, skill)` pairs whose scope-compatibility flipped this session. Admits pure scope-flip cases that a skill-id-only diff misses.     |

When `newlyAddedSkillIds === undefined`, `shouldIncludeTriple` returns `true` unconditionally — legacy pre-D-220 behavior where every scope-compatible skill lands on every existing agent. Passing an empty array (vs `undefined`) is the opt-in signal: preservation rule applies, delta sets happen to be empty.

**`shouldIncludeTriple` decision table** (when `newlyAddedSkillIds` is provided):

| Agent state in `existingStack` | Skill in prior agent's category | Skill in `newlyAddedSkillIds` or `(agent, skill)` in `scopeEligibilityGained` | Result  |
| ------------------------------ | ------------------------------- | ----------------------------------------------------------------------------- | ------- |
| absent (seed branch)           | n/a                             | n/a                                                                           | INCLUDE |
| present                        | yes                             | n/a                                                                           | KEEP    |
| present                        | no                              | yes                                                                           | APPEND  |
| present                        | no                              | no                                                                            | OMIT    |

The OMIT branch is the load-bearing D-220 semantic: a user who previously removed a skill from one agent's curated list keeps it removed across subsequent edits, even when other agents still carry it. See `changelogs/0.137.0.md` D-220 entry.

## Invariants and Caller Contracts

- **Caller-passed scope maps.** `generateProjectConfigFromSkills` throws if `selectedAgents` is provided without matching `skillConfigs` / `agentConfigs`. `getScopeOrThrow` enforces "every selected skill has a `SkillConfig`, every selected agent has an `AgentScopeConfig`" — no silent `"project"` default.
- **Active entry precedence on dual-scope skills.** When the same skill id appears with both an excluded entry and an active entry in `skillConfigs`, `generateProjectConfigFromSkills` builds `skillScope` from the active entry first so the excluded entry cannot overwrite the authoritative scope. This is what lets a global-excluded-plus-project-active pair survive through to `splitConfigByScope` with the correct routing.
- **Excluded-id filter is all-or-nothing.** A skill id is only added to `excludedSkillIds` when EVERY entry for that id is excluded. Dual-scope (excluded global + active project) keeps the id out of the exclusion set so the active project entry still reaches the stack builder.
- **`buildAgentStack` returns `undefined` for empty agent stacks** (no surviving categories) so `buildStackForSelection` can elide the agent from the `stack` property entirely. An agent present in `selectedAgents` but with zero stack entries still appears in `agents`, just not in `stack`.

## Anchors

- `splitConfigByScope`, `scopeEligibilityKey`, `SplitConfigResult`, `generateProjectConfigFromSkills`, `buildStackForSelection`, `buildAgentStack`, `shouldIncludeTriple`, `splitAgentStack` (private), `isScopePairCompatible` (exported) / `isScopeCompatible` (private), `getScopeOrThrow`, `extractCategoryFromPath`, `buildSkillScopeMap` — `src/cli/lib/configuration/config-generator.ts`.
- `computeNewlyAddedSkillIds`, `computeScopeEligibilityGained` — `src/cli/lib/installation/local-installer.ts`.
- `isActiveAt`, `activeAgentScopeMap`, `activeSkillScopeMap`, `effectivelyExcludedSkillIds` — `src/cli/lib/configuration/scope-predicates.ts` (shared predicates consumed by the generator and the delta helpers).
- Post-split reconciliation applied to the project half before every write: `reconcileProjectSplitAgainstGlobal` — `src/cli/lib/installation/local-installer.ts`.
- Call site threading split into writes: `writeScopedFromWizard`'s project branch in `config-gate/index.ts`. Note `splitConfigByScope` is NOT called by `propagateGlobalChangesToProjects` — that path derives its project half from the loaded on-disk config via `retainProjectOwnedSkills` / `retainProjectOwnedAgents` instead.
- `splitConfigByScope` is not re-exported by `src/cli/lib/configuration/index.ts`; import it from `./config-generator`.
- Unit tests: `config-generator.test.ts` (generator + split), `local-installer.test.ts` (delta helpers + scope-split behaviour, driven through the gate).
