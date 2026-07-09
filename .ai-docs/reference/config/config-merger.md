---
scope: reference
area: config
keywords:
  [
    config-merger,
    mergeConfigs,
    mergeWithExistingConfig,
    mergeGlobalConfigs,
    additiveMergeStack,
    mergeAgentCategories,
    compound-key,
    tombstone,
    dual-scope,
    authoritative-semantics,
    projects-field-drop,
  ]
related:
  - reference/config/configuration.md
  - reference/config/config-writer.md
  - reference/config/scope-split.md
  - reference/concepts/tombstone-pattern.md
  - reference/concepts/scope-system.md
last_validated: 2026-04-21
---

# Config Merger Contract

**Last Updated:** 2026-04-21
**Last Validated:** 2026-04-21

> Merge semantics for `ProjectConfig` — the invariants that `writeScopedConfigs`, `cc edit`, and cross-project propagation rely on. Two distinct merge functions live in two modules and obey two different policies. Mixing them up is the recurring source of data-loss bugs in the config pipeline (see D-220, D-221, D-222, and the agent findings under `.ai-docs/agent-findings/`).

## The Two Merge Functions

There are only two actual merge functions in the config pipeline. `additiveMergeStack` and `mergeAgentCategories` are private helpers of `mergeGlobalConfigs`. No function named `additiveMergeAgentCategories` exists.

| Function               | File                                                                        | Policy                                                                                                                         | Called from                                        |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `mergeConfigs`         | `src/cli/lib/configuration/config-merger.ts`                                | **Replace-on-match**: `newConfig` is authoritative for every referenced name/id. Existing preserved only when absent from new. | `mergeWithExistingConfig` (wizard save, `cc edit`) |
| `mergeGlobalConfigs`   | `src/cli/lib/installation/local-installer.ts`                               | **Additive**: existing is preserved as-is; only truly-new items are appended. Never removes.                                   | `writeScopedConfigs` project-context branch        |
| `additiveMergeStack`   | `src/cli/lib/installation/local-installer.ts` (private, exported for tests) | Deep-additive over `Partial<Record<AgentName, StackAgentConfig>>` — agent → category → skill triple.                           | `mergeGlobalConfigs`                               |
| `mergeAgentCategories` | `src/cli/lib/installation/local-installer.ts` (private)                     | Mutates a cloned agent stack in place; appends missing categories and skill assignments.                                       | `additiveMergeStack`                               |

The policy mismatch is intentional: `mergeConfigs` reconciles the wizard's full output with whatever is on disk (tombstones, scope migrations, and dual-scope pairs are expressed via `newConfig` and must reach disk verbatim). `mergeGlobalConfigs` reconciles one project's global slice with the shared `~/.claude-src/config.ts` (other projects' global contributions must never be removed by a project-level write).

## `mergeConfigs` — Replace-on-Match Semantics

**Signature:** `mergeConfigs(newConfig: ProjectConfig, existingConfig: ProjectConfig): ProjectConfig`

**Identity-field precedence (existing wins):** `name`, `description`, `author`, `agentsSource`, `marketplace` — carried forward from `existingConfig` when present. `source` is copied from existing **only when `newConfig.source` is undefined** (so a wizard `--source` flag can overwrite).

**Stack:** `newConfig.stack` wins whenever defined. Existing stack is retained only when `newConfig.stack === undefined` (preserves stack during non-stack-touching operations).

**Agents / skills — the authoritative rule:**

For every existing entry, consult `newConfig`:

1. **Exact compound-key match in new** → rewrite in place with the new entry.
2. **Name/id is in new, but the exact compound key is NOT** → drop the existing entry. This is how scope migrations (P→G, G→P) remove stale rows and how P→G tombstone removal is honored.
3. **Name/id absent from new** → preserve the existing entry verbatim.

After reconciliation, new entries whose compound key was absent from existing are appended, and a final `uniqueBy(list, compoundKey)` collapses any pre-existing on-disk duplicate corruption rather than carrying it forward.

### Compound Identity Keys

Compound keys are the reason dual-scope active/tombstone pairs can coexist and the reason D-221's multiplied-duplicate corruption is prevented.

| Entry | Compound key                                     | Examples                                                            |
| ----- | ------------------------------------------------ | ------------------------------------------------------------------- |
| Agent | `${name}:${scope}${excluded ? ":excluded" : ""}` | `web-developer:project`, `web-developer:global:excluded`            |
| Skill | `${id}:${scope}${excluded ? ":excluded" : ""}`   | `web-framework-react:global`, `web-framework-react:global:excluded` |

Helpers: `agentKey(a)` and `skillKey(s)` in `config-merger.ts`.

D-221 root cause: the prior name-only key collapsed distinct-scope entries onto one slot, and the positional `.map()` over existing rewrote every collision — multiplying duplicates and failing to drop stale rows on scope migration. Compound keys + replace-on-match fixed both.

### Tombstones Under Merge

Tombstones (`excluded: true`) live in the config as ordinary entries with a distinct compound key from their active counterpart. They follow the same authoritative rule:

- A tombstone survives the merge only if `newConfig` explicitly emits it (or does not reference its name/id at all).
- To **remove a tombstone** (P→G reversal), `newConfig` must reference the same name/id with a different compound key (typically the active entry at the other scope). The merger drops the tombstone because its name/id is "in new" but its compound key is not.
- To **preserve a dual-scope pair** (active at one scope + tombstone at another), `newConfig` must carry BOTH entries. The wizard (`generateProjectConfigFromSkills` + `toggleAgentScope`) emits both whenever dual-scope is legitimate. The merger does not infer preservation.

This is the load-bearing invariant called out in `2026-04-17-merger-authoritative-for-names-semantic.md`.

### Known Bug — `projects` Field Drop

**Symptom:** `mergeConfigs` does not preserve `existingConfig.projects`. The base `const merged = { ...newConfig }` only copies fields present on `newConfig`, and `newConfig.projects` is always `undefined` (the `projects` array is maintained exclusively by `registerProjectPath` / `deregisterProjectPath` in `local-installer.ts`).

**Where it hurts:** `cc edit` from `$HOME` takes the pipeline
`writeProjectConfig → buildAndMergeConfig → mergeWithExistingConfig → mergeConfigs → writeScopedConfigs (home-context branch)`.
The written global config loses its `"projects": [...]` entry, and the subsequent propagation guard `if (finalConfig.projects?.length)` is falsy — so `propagateGlobalChangesToProjects` never runs.

**Why the project-context branch is unaffected:** that branch reads `projects` off `effectiveGlobalConfig`, which is built from a `...existingGlobalConfig` spread that preserves the field. Only the home-context propagation path is silently unreachable in production.

**Source:** `.ai-docs/agent-findings/2026-04-18-mergeConfigs-drops-projects-field.md`. Proposed one-line fix is documented in that finding.

## `mergeWithExistingConfig` — The Caller

**Signature:** `mergeWithExistingConfig(newConfig: ProjectConfig, { projectDir }): Promise<{ config, merged, existingConfigPath? }>`

Two-tier fallback:

1. **Full config exists** at `projectDir/.claude-src/config.ts` → call `mergeConfigs(newConfig, existingFullConfig.config)`, return `{ merged: true, existingConfigPath }`.
2. **No full config, only legacy source stub** → copy `author` and `agentsSource` from the simple project source config if present. Return `{ merged: false }`.

The `merged: false` path never calls `mergeConfigs` — there is nothing to reconcile.

## `mergeGlobalConfigs` — Additive Semantics

**Signature:** `mergeGlobalConfigs(existing: ProjectConfig, incoming: ProjectConfig): { config, changed }`

Invoked only from `writeScopedConfigs` project-context branch after `splitConfigByScope(finalConfig).global`. The `incoming` side is this-project's global contribution; `existing` is the on-disk shared global config that other projects may have contributed to.

| Field            | Rule                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills`         | Existing preserved verbatim. Active incoming skills (`!excluded`) appended when `id` not already in existing.                                 |
| `agents`         | Existing preserved verbatim. Active incoming agents (`!excluded`) appended when `name` not already in existing.                               |
| `stack`          | Deep-additive via `additiveMergeStack` (agent → category → skill triple). Existing entries and their `preloaded` flags are never overwritten. |
| `domains`        | Set-union of existing and incoming.                                                                                                           |
| `selectedAgents` | Set-union of existing and incoming.                                                                                                           |
| Everything else  | Carried from existing via `{ ...existing, skills, agents, stack, domains, selectedAgents }` — including `projects`.                           |

**Excluded entries are ignored on the incoming side.** Tombstones are project-local state; they live in the PROJECT config via `splitConfigByScope`, not in the global one. The global-scope-with-excluded pattern (a project suppressing a shared global item) is expressed by the project config's tombstone row, not by rewriting the global config.

**`changed` is `true` iff** at least one new skill, new agent, appended stack triple, or new domain/selectedAgent entry landed. The caller uses this to decide whether to rewrite `~/.claude-src/config.ts` and whether to propagate to other registered projects.

Rationale source: `2026-04-06-agent-merge-key-mismatch-with-skills.md`, `2026-04-17-merge-global-configs-per-agent-update-loss.md`.

## `additiveMergeStack` — The Agent → Category → Skill Triple

**Signature:**
`additiveMergeStack(existing, incoming): { stack, changed }`
where `stack` is `Partial<Record<AgentName, StackAgentConfig>>`.

Clones `existing` via `structuredClone` so input is never mutated. Then, for each `(agentName, incomingAgentStack)` in `incoming`:

1. Agent absent in existing → clone incoming's whole agent stack into merged. `changed = true`.
2. Agent present → delegate to `mergeAgentCategories(existingAgentStack, incomingAgentStack)`, which returns whether anything was appended.

`mergeAgentCategories` mutates its `existingAgentStack` argument in place (safe because the caller already cloned). For each `(category, incomingAssignments)`:

1. Category absent → copy `incomingAssignments.map(a => ({ ...a }))` into the slot.
2. Category present → for each assignment in incoming whose `id` is not already in existing's Set-of-ids, push a shallow-cloned copy and mark changed.

The triple rule in one sentence: **an (agent, category, skill-id) triple is added iff the exact triple is absent from existing; nothing in existing is ever overwritten, not even a `preloaded: false` flag**.

## Interactions

### `mergeConfigs` vs `mergeGlobalConfigs` — Opposite Polarities

| Aspect            | `mergeConfigs`                             | `mergeGlobalConfigs`                 |
| ----------------- | ------------------------------------------ | ------------------------------------ |
| Authority         | `newConfig` authoritative                  | `existing` authoritative             |
| Scope migrations  | Drops stale rows (the point)               | Never drops                          |
| Tombstone cleanup | Drops tombstone when name/id re-referenced | Ignores incoming tombstones entirely |
| Stack             | Wholesale replace when new defines it      | Deep-additive, never overwrites      |
| `projects` field  | **Dropped** (bug; see finding 2026-04-18)  | Preserved via `...existing` spread   |
| Called where      | `cc edit`, wizard save                     | Project-context global write         |

A `cc edit` from a project directory traverses both: `mergeConfigs` reconciles the wizard output with the project's on-disk view, then `writeScopedConfigs` splits by scope and feeds the global half through `mergeGlobalConfigs` to update the shared global config without trampling other projects.

### Tombstone Flow End-to-End

1. Wizard `toggleAgentScope(G→P)` emits both an active project-scoped entry AND an excluded global-scoped tombstone in `newConfig`.
2. `mergeConfigs` accepts both (their compound keys differ). If existing had only the global-active entry, its compound key `name:global` is not in new, but its name IS — so it gets dropped. The two new entries land.
3. `splitConfigByScope(finalConfig)` routes the active entry to the project config and the tombstone to the project config as well (tombstones are project-local). The global split carries only actives. See [scope-split.md](./scope-split.md) for the partition rules.
4. `mergeGlobalConfigs` merges the (now-empty-of-this-name) global split against the shared global — existing stays, nothing removed.
5. Result: the shared global config still contains the agent (other projects still see it), the project config contains the tombstone (this project suppresses it locally).

The reverse (P→G) relies on `mergeConfigs` step 2 to drop the tombstone: `newConfig` now has `name:global` active but not `name:global:excluded`, so the existing tombstone row (`name:global:excluded`) is dropped because its name is in new but its compound key is not.

## Anchors

- Compound key helpers: `agentKey`, `skillKey` in `config-merger.ts`.
- `mergeConfigs`, `mergeWithExistingConfig`: `config-merger.ts`.
- `mergeGlobalConfigs`, `additiveMergeStack`, `mergeAgentCategories`: `local-installer.ts`.
- Call site threading `mergeGlobalConfigs` into writes: `writeScopedConfigs` project-context branch in `local-installer.ts`.
- Call site threading `mergeConfigs` into writes: `buildAndMergeConfig` → `writeProjectConfig` operation.
- Unit tests: `config-merger.test.ts` (`mergeConfigs`, `mergeWithExistingConfig`), `local-installer.test.ts` (`mergeGlobalConfigs` describe block).

## Findings That Shaped This Doc

| Finding                                                    | Contribution                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `2026-04-06-agent-merge-key-mismatch-with-skills.md`       | Compound keys for agents to match the existing skill pattern.           |
| `2026-04-17-merger-authoritative-for-names-semantic.md`    | Authoritative-for-names semantic; dual-scope invariant is load-bearing. |
| `2026-04-17-merge-global-configs-per-agent-update-loss.md` | Per-agent update loss bug in `mergeGlobalConfigs` stack policy.         |
| `2026-04-18-mergeConfigs-drops-projects-field.md`          | `projects` field drop and its propagation impact.                       |
