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
    projects-field-preserve,
    authoritative-scope,
    ConfigLoadError,
    cross-scope-reconciliation,
  ]
related:
  - reference/features/configuration.md
  - reference/config/config-writer.md
  - reference/config/scope-split.md
  - reference/concepts/tombstone-pattern.md
  - reference/concepts/scope-system.md
last_validated: 2026-08-18
---

# Config Merger Contract

> Merge semantics for `ProjectConfig` — the invariants that `writeScopedFromWizard`, `cc edit`, and cross-project propagation rely on. Two distinct merge functions live in two modules and obey two different policies. Mixing them up is the recurring source of data-loss bugs in the config pipeline(see D-220, and the agent findings under `.ai-docs/agent-findings/`).

## The Two Merge Functions

There are only two actual merge functions in the config pipeline. `additiveMergeStack` and `mergeAgentCategories` are private helpers of `mergeGlobalConfigs`. No function named `additiveMergeAgentCategories` exists.

| Function               | File                                                           | Policy                                                                                                                         | Called from                                                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mergeConfigs`         | `src/cli/lib/configuration/config-merger.ts`                   | **Replace-on-match**: `newConfig` is authoritative for every referenced name/id. Existing preserved only when absent from new. | `mergeWithExistingConfig` (wizard save, `cc edit`)                                                                                                                                                             |
| `mergeGlobalConfigs`   | `src/cli/lib/config-gate/propagate.ts`                         | **Additive**: existing is preserved as-is; only truly-new items are appended. Never removes.                                   | `resolveEffectiveGlobalConfig`'s `addSessionToGlobal` resolution, on the `writeScopedFromWizard` project branch — **not** on that branch's `authoritativeScope: "all"` path, which runs `mergeConfigs` instead |
| `additiveMergeStack`   | `src/cli/lib/config-gate/propagate.ts` (private, not exported) | Deep-additive over `Partial<Record<AgentName, StackAgentConfig>>` — agent → category → skill triple.                           | `mergeGlobalConfigs`                                                                                                                                                                                           |
| `mergeAgentCategories` | `src/cli/lib/config-gate/propagate.ts` (private)               | Mutates a cloned agent stack in place; appends missing categories and skill assignments.                                       | `additiveMergeStack`                                                                                                                                                                                           |

The policy mismatch is intentional: `mergeConfigs` reconciles the wizard's full output with whatever is on disk (tombstones, scope migrations, and dual-scope pairs are expressed via `newConfig` and must reach disk verbatim). `mergeGlobalConfigs` reconciles one project's global slice with the shared `~/.claude-src/config.ts` (other projects' global contributions must never be removed by a project-level write).

### What neither merge function does: cross-scope reconciliation

Neither function compares a project entry against a global entry. `mergeConfigs` sees one config's worth of rows keyed by compound key; `mergeGlobalConfigs` only ever appends. The rule that a project-owned skill and a colliding live global install cannot both be active is enforced **after** the split, by `reconcileProjectSplitAgainstGlobal` in `config-gate/propagate.ts`, immediately before each project-config write. Do not add a collision rule to either merge function — see [config-writer.md](./config-writer.md) → "Cross-Scope Reconciliation" for the shared helper and its two write sites.

`mergeGlobalConfigs` is also not involved in the global-uninstall fan-out: `pruneGlobalEntriesFromRegisteredProjects` bypasses merging entirely and re-enters `propagateGlobalChangesToProjects` with an emptied global config.

## `mergeConfigs` — Replace-on-Match Semantics

**Signature:** `mergeConfigs(newConfig: ProjectConfig, existingConfig: ProjectConfig, options?: MergeOptions): ProjectConfig`

where `MergeOptions = Pick<MergeContext, "authoritativeScope">`.

**Identity-field precedence — six fields, and they do not all obey the same rule.** Read the guard, not the group heading. There is no `source` field on `ProjectConfig`; the field a `--marketplace` flag lands on is `marketplace`.

| Field             | Guard                                                       | Rule                                                                                |
| ----------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `name`            | `if (existingConfig.name)`                                  | **Existing wins** unconditionally                                                   |
| `description`     | `if (existingConfig.description)`                           | **Existing wins** unconditionally                                                   |
| `author`          | `if (existingConfig.author)`                                | **Existing wins** unconditionally                                                   |
| `agentsSource`    | `if (existingConfig.agentsSource)`                          | **Existing wins** unconditionally                                                   |
| `marketplaceName` | `if (existingConfig.marketplaceName)`                       | **Existing wins** unconditionally                                                   |
| `marketplace`     | `if (existingConfig.marketplace && !newConfig.marketplace)` | **Fill-only** — existing is used only when the incoming config names no marketplace |

`marketplace` sitting in an "existing wins" list is what made this table worth writing out: it is the one identity field an incoming value overrides, which is how an `init --marketplace <ref>` over an existing install repoints the marketplace. `marketplaceName` was absent from this document entirely and is on the OTHER side of that line — the resolved name cannot be overridden here, and `mergeGlobalConfigs` fills it only when the global config has none (below).

**`name` is not always the existing config's.** `mergeWithExistingConfig` does not hand `mergeConfigs` the loaded config verbatim: `existingConfigForMerge(loaded, projectDir, ownName)` compares `loaded.configPath` against `getProjectConfigPath(projectDir)` and, when they differ, substitutes `newConfig.name` for the loaded `name` before the merge. The load that differs is `loadProjectConfig`'s home fallback — a project with no `config.ts` of its own reconciles against the GLOBAL config, whose `name` is `GLOBAL_CONFIG_NAME` (`"global"`) and identifies that installation rather than this directory. Without the substitution the carry-forward above would stamp `"global"` onto the project's own first-written file. The carry-forward itself is deliberate and stays: a project's own prior config is how a hand-renamed `config.ts` keeps its name across saves. What decides between the two is the PROVENANCE of the load, which is known only in `mergeWithExistingConfig` and nowhere inside the pure merge.

**Stack:** `newConfig.stack` wins whenever defined. Existing stack is retained only when `newConfig.stack === undefined` (preserves stack during non-stack-touching operations).

**Agents / skills — the authoritative rule:**

For every existing entry, consult `newConfig` (`flatMap` over existing, then append new-only):

1. **Exact compound-key match in new** → rewrite in place with the new entry.
2. **Name/id is in new, but the exact compound key is NOT** → drop the existing entry. This is how scope migrations (P→G, G→P) remove stale rows and how P→G tombstone removal is honored.
3. **Name/id absent from new, but the existing config carried a global tombstone for that name/id this session** (dual-scope) → drop the lingering active entry AND the stale tombstone together (Scenario B full-deselect).
4. **Name/id absent from new, and within the current edit's authority** (see `authoritativeScope` below) → drop the existing entry. No id is exempt: a skill the wizard could not resolve is absent for a different reason than a deselection, but the outcome is the same removal — see below.
5. **Name/id absent from new otherwise** → preserve the existing entry verbatim.

> **What an "absent" global entry means.** Rules 3 and 4 read absence as deselection. A project-scope edit can no longer produce that absence for a globally-installed item: the wizard guards refuse the deselect, and `applySkillRemoval` leaves an inherited global-active entry byte-identical rather than dropping it or tombstoning it. So under `authoritativeScope: "owned"` a global entry absent from `newConfig` reflects a global-scope change or a legacy config, never a project-scope deselection. Tombstones in `newConfig` come from the `s` scope toggle or a system-derived conflict mask only. See [concepts/tombstone-pattern.md](../concepts/tombstone-pattern.md).

After reconciliation, new entries whose compound key was absent from existing are appended, and a final `uniqueBy(list, compoundKey)` collapses any pre-existing on-disk duplicate corruption rather than carrying it forward.

### `authoritativeScope` (Scenario C)

`options.authoritativeScope` decides whether an existing entry that is _absent_ from `newConfig` was deliberately deselected (drop) or merely untouched (preserve):

| Value       | Meaning                                                                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"all"`     | Global-context edit at `~/`: the wizard loaded the ENTIRE global config, so every existing entry is in authority — an absent entry was removed.                                                                  |
| `"owned"`   | Project-context edit: authority covers only project-owned entries (`isProjectOwned` — project-scoped + the project's own global tombstones). Inherited global-active entries are read-only and always preserved. |
| `undefined` | init / non-edit merges: additive union-preserve (never drop an absent entry).                                                                                                                                    |

`isWithinSessionAuthority(entry, scope)` implements the `"all"`/`"owned"` gate.

**A skill the wizard could not resolve is dropped, not exempted.** The merge takes no `unresolvableSkillIds` set and grants no id an exemption: an entry the wizard could not represent is absent from `newConfig` for a different reason than a deselection, and drops on the same terms. Exempting it would leave `config.ts` carrying an entry that the same run's `Changes:` block announced as removed and the recompiled agent no longer carried — three surfaces, three answers about one skill. What replaces the exemption is the reason: `edit` names each such skill and says why it went. The one thing the drop still cannot reach is an INHERITED global-active entry during a project edit, because `"owned"` authority never covered it.

**The reason is class-specific.** `unresolvedSkillRemovalReasons` (`src/cli/lib/skills/unresolved-skill-entries.ts`) classifies each unresolvable id against the install path its own saved entry names, and `edit` prints the matching sentence after the removal row. Five classes, four sentences — the fifth refuses the run before any of this prints:

| Fate                   | When                                                                                                          | Sentence in the `Changes:` block                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `dropped-by-source`    | the entry claims no local copy (`source !== EJECT_SOURCE`, or no saved entry at all)                          | `not present in <sourceLabel>`                                                          |
| `files-gone`           | an eject entry whose `<skillsDir>/<id>` no longer exists                                                      | `skill files no longer exist at <skillDir>`                                             |
| `not-installed-there`  | the directory exists but registers no skill by that name — no `metadata.yaml`, or a `SKILL.md` naming another | `no skill named '<id>' is installed at <skillDir>`                                      |
| `unplaceable-category` | the install is intact and its declared category is one no domain in this source claims                        | `installed at <skillDir>, but its category '<category>' is not one this source knows`   |
| `unusable-metadata`    | the directory exists and its `metadata.yaml` describes no skill                                               | none — `BaseCommand.ensureSavedSkillsReadable` refuses the run before the wizard mounts |

Told apart at the entry's own install path (`resolveInstallPaths(projectDir, saved.scope)`), reusing the judgments the rest of the CLI already makes about that directory: `readSkillMetadata` for the file, `parseFrontmatter(...).name` for the identity. The refusal half is `findUnusableSavedSkillMetadata` from the same module — see [concepts/guard-pattern.md](../concepts/guard-pattern.md), "Pre-Wizard Saved-Skill Metadata Refusal".

### Compound Identity Keys

Compound keys are the reason dual-scope active/tombstone pairs can coexist, and the reason multiplied-duplicate corruption is prevented.

| Entry | Compound key                                     | Examples                                                            |
| ----- | ------------------------------------------------ | ------------------------------------------------------------------- |
| Agent | `${name}:${scope}${excluded ? ":excluded" : ""}` | `web-developer:project`, `web-developer:global:excluded`            |
| Skill | `${id}:${scope}${excluded ? ":excluded" : ""}`   | `web-framework-react:global`, `web-framework-react:global:excluded` |

Helpers: `agentKey(a)` and `skillKey(s)` in `config-merger.ts`.

**`model` and `effort` are NOT part of the identity key.** A key match replaces the whole entry, so the merge is whole-entry, never field-level — see [features/model-and-effort.md](../features/model-and-effort.md).

**Do not key on name alone.** A name-only key collapses distinct-scope entries onto one slot, and a positional `.map()` over existing entries then rewrites every collision — multiplying duplicates and failing to drop stale rows on scope migration. Compound keys plus replace-on-match are what prevent both.

### Tombstones Under Merge

Tombstones (`excluded: true`) live in the config as ordinary entries with a distinct compound key from their active counterpart. They follow the same authoritative rule:

- A tombstone survives the merge only if `newConfig` explicitly emits it (or does not reference its name/id at all).
- To **remove a tombstone** (P→G reversal), `newConfig` must reference the same name/id with a different compound key (typically the active entry at the other scope). The merger drops the tombstone because its name/id is "in new" but its compound key is not.
- To **preserve a dual-scope pair** (active at one scope + tombstone at another), `newConfig` must carry BOTH entries. The wizard (`generateProjectConfigFromSkills` + `toggleAgentScope`) emits both whenever dual-scope is legitimate. The merger does not infer preservation.

This is the load-bearing "merger is authoritative for names" invariant (April-2026 merger-authoritative-for-names finding; codified in CLAUDE.md Data Integrity).

### `projects` Field Preservation

`mergeConfigs` **preserves** `existingConfig.projects`. The base `const merged = { ...newConfig }` only copies fields present on `newConfig`, and `newConfig.projects` is always `undefined` (the `projects` array is maintained exclusively by `registerProjectPath` / `deregisterProjectPath` in `config-gate/propagate.ts`), so a final guard copies it forward:

```typescript
if (existingConfig.projects && !newConfig.projects) {
  merged.projects = existingConfig.projects;
}
```

**Why it matters:** `cc edit` from `$HOME` takes the pipeline
`writeProjectConfig → buildAndMergeConfig → mergeWithExistingConfig → mergeConfigs → writeScopedFromWizard (home branch)`.
Without the guard the written global config would lose its `"projects": [...]` entry, the home-context propagation guard `if (finalConfig.projects?.length)` would read falsy, and `propagateGlobalChangesToProjects` would never run. The guard is what makes home-context propagation reachable at all — do not drop it when refactoring the merge base.

## `mergeWithExistingConfig` — The Caller

**Signature:** `mergeWithExistingConfig(newConfig: ProjectConfig, context: MergeContext): Promise<MergeResult>`

where `MergeContext = { projectDir: string; authoritativeScope?: AuthoritativeScope }` and `MergeResult = { config: ProjectConfig; merged: boolean; existingConfigPath?: string }`.

Two-tier fallback, gated on `loadProjectConfig(context.projectDir)`:

1. **Full config loads** → call `mergeConfigs(newConfig, existingFullConfig.config, { authoritativeScope })`, return `{ merged: true, existingConfigPath }`.
2. **Load returns `null`** → copy `author` and `agentsSource` from the legacy project source stub (`loadProjectSourceConfig`) if present. Return `{ merged: false }`.

The `merged: false` path never calls `mergeConfigs` — there is nothing to reconcile. `buildAndMergeConfig` (in `local-installer.ts`) is the production caller that threads `authoritativeScope` into the context.

**`loadProjectConfig`, not `loadProjectConfigFromDir`.** The load leg checks `context.projectDir` first and then falls back to `os.homedir()` when `projectDir` is not already home. A project with no `.claude-src/config.ts` of its own therefore merges against the GLOBAL config, not against nothing.

**Third outcome: the load can THROW.** `loadProjectConfigFromDir` returns `null` only when the config file is MISSING; a file that exists but cannot be loaded (evaluation error, no object default export, loader-schema violation) raises `ConfigLoadError`. `mergeWithExistingConfig` does not catch it, so it propagates through `buildAndMergeConfig` → `writeProjectConfig` → the calling command. This is deliberate: a corrupt config previously read as `null` and dropped the wizard into the tier-2 stub path, where the entire on-disk roster was invisible and the next write silently replaced it. See [../features/configuration.md](../features/configuration.md) → "Config Load Outcomes".

## `mergeGlobalConfigs` — Additive Semantics

**Signature:** `mergeGlobalConfigs(existing: ProjectConfig, incoming: ProjectConfig): { config, changed }`

Invoked from `writeScopedFromWizard`'s project branch after `splitConfigByScope(finalConfig).global` — but not on every pass through it, and not directly: `resolveEffectiveGlobalConfig` chooses between it and `mergeConfigs` (next section). The `incoming` side is this-project's global contribution; `existing` is the on-disk shared global config that other projects may have contributed to.

| Field                             | Rule                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills`                          | Existing preserved verbatim. Active incoming skills (`!excluded`) appended when `id` not already in existing.                                                                                                                                                                                                                             |
| `agents`                          | Existing preserved verbatim. Active incoming agents (`!excluded`) appended when `name` not already in existing.                                                                                                                                                                                                                           |
| `stack`                           | Deep-additive via `additiveMergeStack` (agent → category → skill triple). Existing entries and their `preloaded` flags are never overwritten.                                                                                                                                                                                             |
| `selectedDomains`                 | Set-union of existing and incoming (deduplicated).                                                                                                                                                                                                                                                                                        |
| `marketplace` / `marketplaceName` | **Fill-only**: `existing ?? incoming`, per field. Existing wins; incoming is used only when the global config has no value yet. A project-context write never repoints global marketplace identity (only a global-scope `init` from `~` does). Each is spread conditionally, so a pair that resolves to `undefined` writes no key at all. |
| Everything else                   | Carried from existing via `{ ...existing, skills, agents, stack, selectedDomains, ...(marketplaceName), ...(marketplace) }` — including `projects`. There is no `source` key: the field is `marketplace`.                                                                                                                                 |

**Excluded entries are ignored on the incoming side.** Tombstones are project-local state; they live in the PROJECT config via `splitConfigByScope`, not in the global one. The global-scope-with-excluded pattern (a project suppressing a shared global item) is expressed by the project config's tombstone row, not by rewriting the global config.

**`changed` is `true` iff** at least one new skill, new agent, or appended stack triple landed, the deduplicated `selectedDomains` union differs from `existing.selectedDomains` (compared with remeda's `isDeepEqual`), OR either of `marketplaceName` / `marketplace` was newly filled — the two are separate terms, `mergedMarketplaceName !== existing.marketplaceName` and `mergedMarketplace !== existing.marketplace`. The caller uses this flag to decide whether to rewrite `~/.claude-src/config.ts` and whether to propagate to other registered projects.

Rationale: the April-2026 agent-merge-key-mismatch and per-agent-update-loss findings, plus `2026-07-20-config-merge-functions-disagree-on-source-identity.md` (source-identity fill-only rule).

## `resolveEffectiveGlobalConfig` — which merge a project write gets

**File:** `src/cli/lib/config-gate/propagate.ts`
**Signature:** `resolveEffectiveGlobalConfig(globalSplit, existingGlobalConfig, projectDir, authority?) : Promise<{ config, globalDataChanged, changed }>`

A project-context write does not reach `mergeGlobalConfigs` unconditionally. This helper picks one of two module-private resolutions on `authority` — the same `AuthoritativeScope` word `mergeConfigs` uses — and then calls `registerProjectPath` on whichever config came back.

| `authority`              | Resolution             | Merge it runs                                                        | A global entry the session left out |
| ------------------------ | ---------------------- | -------------------------------------------------------------------- | ----------------------------------- |
| `undefined` or `"owned"` | `addSessionToGlobal`   | `mergeGlobalConfigs(existing, globalSplit)` — additive               | **Preserved**                       |
| `"all"`                  | `matchGlobalToSession` | `mergeConfigs(globalSplit, existing, { authoritativeScope: "all" })` | **Removed**                         |

**`matchGlobalToSession` is the one path on which a PROJECT-context write removes global entries.** It has a single caller — a confirmed `edit --from` — and the word arrives from the command, not from the shape of the data: the run states a whole roster, its plan showed every global removal under its own heading, named every other registered project the removal reaches, and somebody answered yes. It reuses `mergeConfigs` rather than a merge of its own because "absent from the session means deselected" is exactly what `authoritativeScope: "all"` already means at the home root, and because `mergeConfigs` carries the global installation's identity, its stack fallback and its `projects[]` registry across — a session's split says nothing about who the global installation is or which projects read it, and the fan-out walks that registry. `changed` is `!isDeepEqual(config, existingGlobalConfig)`.

**`addSessionToGlobal` has a shortcut `matchGlobalToSession` deliberately lacks.** When the split carries neither skills nor agents it returns the existing config (or `{ name: GLOBAL_CONFIG_NAME, skills: [], agents: [] }` when there is none) with `changed: false`, short-circuiting the merge entirely: a project install has asked nobody about the machine, so a session carrying nothing global is not a statement that the global install should be empty. Under `"all"` an empty session IS a real answer, so there is no such shortcut there — a configuration that installs nothing globally removes what was.

With no `existingGlobalConfig` at all, both resolutions return `globalSplit` verbatim with `changed: true`.

The returned `globalDataChanged` is the merge's own flag and gates nothing but the caller's bookkeeping; `changed` folds in `registerProjectPath`'s flag and gates the write-skip. Propagation is driven by `classifyGlobalChange`, not by either — see [config-writer.md](./config-writer.md) → "Two flags, and they gate different things".

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

| Aspect            | `mergeConfigs`                                      | `mergeGlobalConfigs`                 |
| ----------------- | --------------------------------------------------- | ------------------------------------ |
| Authority         | `newConfig` authoritative                           | `existing` authoritative             |
| Scope migrations  | Drops stale rows (the point)                        | Never drops                          |
| Tombstone cleanup | Drops tombstone when name/id re-referenced          | Ignores incoming tombstones entirely |
| Stack             | Wholesale replace when new defines it               | Deep-additive, never overwrites      |
| `projects` field  | Preserved (`existing.projects ?? none`)             | Preserved via `...existing` spread   |
| `marketplace`     | **Fill-only** (existing only when new is undefined) | Fill-only (`existing ?? incoming`)   |
| `marketplaceName` | Existing wins unconditionally                       | Fill-only (`existing ?? incoming`)   |
| Called where      | `cc edit`, wizard save                              | Project-context global write         |

A `cc edit` from a project directory traverses both: `mergeConfigs` reconciles the wizard output with the project's on-disk view, then `writeScopedFromWizard` splits by scope and feeds the global half through `mergeGlobalConfigs` to update the shared global config without trampling other projects.

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
- `mergeGlobalConfigs`, `additiveMergeStack`, `mergeAgentCategories`: `config-gate/propagate.ts`.
- Call site threading `mergeGlobalConfigs` into writes: `writeScopedFromWizard`'s project branch, via `resolveEffectiveGlobalConfig` in `config-gate/propagate.ts` — which reaches it through `addSessionToGlobal` only; the `authoritativeScope: "all"` path (`matchGlobalToSession`) runs `mergeConfigs` in its place.
- The identity substitution on the home-fallback load: `existingConfigForMerge` in `config-merger.ts` (private).
- **Its `changed` flag no longer gates propagation.** Since the config-gate landed the fan-out is driven by `classifyGlobalChange`, which diffs the config on disk against the one being written; `mergeGlobalConfigs`' `changed` survives only as part of `effective.changed`, gating the write-skip. This closes the blind spot where a per-skill `source` change on an already-present entry set no merge flag and therefore propagated nothing.
- Call site threading `mergeConfigs` into writes: `buildAndMergeConfig` → `writeProjectConfig` operation.
- `ConfigLoadError`, `loadProjectConfig`, `loadProjectConfigFromDir`: `src/cli/lib/configuration/project-config.ts`.
- Post-split cross-scope reconciliation (NOT in either merger): `reconcileProjectSplitAgainstGlobal` in `config-gate/propagate.ts`.
- Unit tests: `config-merger.test.ts` (`mergeConfigs`, `mergeWithExistingConfig`), `project-config.test.ts` (`ConfigLoadError` cases), `local-installer.test.ts` (`mergeGlobalConfigs` describe block).
