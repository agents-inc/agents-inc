---
scope: reference
area: config
keywords:
  [
    config-writer,
    config-gate,
    generateConfigSource,
    generateProjectConfigWithInlinedGlobal,
    config-types-writer,
    scope-split,
    global-config,
    writeScopedFromWizard,
    writeProjectConfigPair,
    reconcileTypesFromDisk,
    mutateGlobal,
    propagateGlobalRemoval,
    ensureBlankPair,
    writeProjectPartial,
    propagateGlobalChangesToProjects,
    buildProjectTypesExtras,
    projectInstallationExists,
    resolveEffectiveGlobalConfig,
    buildCompileAgents,
    buildAgentScopeMap,
    config-to-compile-bridge,
    formatSectionedUnion,
    collectCustomDomains,
    buildSkillsByCategory,
    computeRemovedGlobalSkillIds,
    retainReconciledStack,
    reconcileProjectSplitAgainstGlobal,
    maskCollidingGlobalSkills,
    maskCollidingGlobalAgents,
    dropOrphanedDerivedMasks,
    buildProjectCollisionTest,
    isExclusiveCategory,
    pruneGlobalEntriesFromRegisteredProjects,
    GateReport,
    GlobalChangeSet,
    recompilePropagatedProjectAgents,
    normalizeProjectPath,
  ]
related:
  - reference/config/configuration.md
  - reference/config/config-merger.md
  - reference/config/scope-split.md
  - reference/concepts/scope-system.md
  - reference/concepts/tombstone-pattern.md
last_validated: 2026-07-30
---

<!-- PARTIAL 2026-08-02 (b) · post-landing reconciliation (`last_validated` deliberately NOT moved)
     ✓ the L4 guard-test spec count only: corrected 17 -> 23 by RUNNING the file
       (`vitest run src/cli/lib/__tests__/config-gate-enforcement.test.ts` reports 23 passed),
       not by counting `it(` lines — two `it.each` blocks contribute two cases each. This doc
       is declared the owner of that count; boundary-map.md's restatement was removed rather
       than corrected, per the count-ownership rule.
     ✗ nothing else re-checked beyond the 2026-08-02 (a) basis below
-->
<!-- PARTIAL 2026-08-02 · config-gate landing (`last_validated` deliberately NOT moved)
     ✓ every write site, entry point and caller re-derived from src/cli/lib/config-gate/
       (index.ts, pair-writer.ts, classify.ts, propagate.ts, recompile.ts, gate-token.ts)
       and from the migrated call sites — the writer-selection table, the wizard-write
       branches, propagation callers, the D-240 row, buildProjectTypesExtras
     ✗ generateConfigSource internals, union-emission internals, both observability
       gaps, cross-scope masking rules — still on the 2026-07-30 / 2026-08-01 basis
-->
<!-- VALIDATED 2026-08-01 · PARTIAL (product 0.147.1)
     ✓ "Path normalization", "registerProjectPath — stale-filter semantics" and
       "deregisterProjectPath — removal semantics" only
     ✗ everything else — generateConfigSource, the D-279 reconciliation inventory, the
       writer-selection table, both observability gaps, cross-scope masking — 2026-07-30 basis
-->

# Config Writer (Detailed)

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

> **Extracted from:** `reference/features/configuration.md` (Config Writer and Config Types Writer sections).

## Config Writer

**File:** `src/cli/lib/configuration/config-writer.ts`

Replaced the former `writeProjectSourceConfig()`. **Renders only — it writes nothing.** Every function below returns a TypeScript source string; the module has held no filesystem call since the config-gate landed (2026-08-02), because a rendered pair half that any caller may then write is exactly the ungated write the gate exists to prevent.

| Function                                 | Purpose                                       |
| ---------------------------------------- | --------------------------------------------- |
| `generateConfigSource()`                 | Main entry: generates config.ts source string |
| `generateBlankGlobalConfigSource()`      | Blank global config (empty arrays)            |
| `generateBlankGlobalConfigTypesSource()` | Blank config-types.ts (all types = `never`)   |
| `getGlobalConfigImportPath()`            | Returns absolute path to `~/.claude-src/`     |

`generateConfigSource` is import-restricted: eslint's L2(c) block admits it only inside `config-gate/**` and `configuration/**` (see [The config-gate](#the-config-gate) below).

**Two writers moved out of this module and one module was deleted.** All three were ways to put a config half on disk without the gate:

| Was                                                          | Now                                                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `config-writer.ts::writePartialProjectConfig()`              | `config-gate::writeProjectPartial()` — same defaults and `fallbackName`, plus a `GlobalPairWriteViolation` throw at `$HOME`     |
| `config-writer.ts::ensureBlankGlobalConfig()`                | `config-gate::ensureBlankPair()` — writes BOTH halves, where the old function wrote `config.ts` alone                           |
| `configuration/config-saver.ts::saveSourceToProjectConfig()` | `config-gate::mutateGlobal({ kind: "set-source" })` at `$HOME`, `writeProjectPartial()` at project scope; the module is deleted |

The `generateConfigSource()` function accepts an optional `ConfigSourceOptions` parameter:

- When `isProjectConfig: true` (no `globalConfig`): generates a config that imports from the global config and spreads global arrays into skills, agents, and domains.
- When `isProjectConfig: true` with `globalConfig` provided: generates a self-contained config snapshot via `generateProjectConfigWithInlinedGlobal()`. Both global and project entries for the same skill ID are preserved (no deduplication). Global entries appear under a `// global` comment, project entries under `// project`. Excluded global entries (tombstones) replace their active global counterparts in the global section while the active project entry appears separately in the project section. Stack entries are filtered to project-scoped agents only.

## Config Types Writer

**File:** `src/cli/lib/configuration/config-types-writer.ts`

Generates `config-types.ts` files with typed union types narrowed to installed items.

The two emitted template halves (`PROJECT_CONFIG_TYPES_BEFORE`, `PROJECT_CONFIG_INTERFACE_AFTER`), `ProjectConfigTypesOptions`, and why `ProjectAgentName` / `SelectedAgentName` are emitted **strings** rather than exports: [leaf-exports.md](../leaf-exports.md). The `model?` / `effort?` lines these templates emit: [features/model-and-effort.md](../features/model-and-effort.md). Generated configs import from the sibling `./config-types`, never from the package — which is why shipping zero `.d.ts` has been survivable; see [build-and-packaging.md](../build-and-packaging.md), which also records that the documented `@agents-inc/cli/config` jiti alias does **not** resolve under the built CLI.

| Function                             | Purpose                                           |
| ------------------------------------ | ------------------------------------------------- |
| `generateConfigTypesSource()`        | Generate standalone config-types.ts from matrix   |
| `generateProjectConfigTypesSource()` | Generate project config-types.ts extending global |
| `regenerateConfigTypes()`            | Full regeneration with background matrix loading  |
| `loadConfigTypesDataInBackground()`  | Kick off background matrix/agent loading          |
| `getGlobalConfigTypesPath()`         | Check if global config-types.ts exists            |

When a global installation exists, project `config-types.ts` imports from global and extends with project-only types. Types are narrowed to only installed items (not the full matrix).

**`regenerateConfigTypes` refuses the home directory.** Its first statement is `if (isHomeDirectory(projectDir)) throw new GlobalPairWriteViolation(...)`: `~/.claude-src/config-types.ts` is the global pair's types half, which only the gate writes. The throw is deliberately upstream of `utils/fs.ts`'s runtime tripwire — it names the offending entry point rather than a path, and it still fires in a unit test that mocks `utils/fs`. `generateConfigTypesSource`, `assembleConfigTypesSource` and `regenerateConfigTypes` are also import-restricted to `config-gate/**` and `configuration/**`.

**Every emitted `config-types.ts` opens with a generated-file stamp.** `assembleConfigTypesSource` prefixes the output with the single line `// AUTO-GENERATED by agents-inc — DO NOT EDIT`, ahead of the import block when there is one. It is the ONE place the stamp is written: the blank-global variant (`generateBlankGlobalConfigTypesSource`, which lives in `config-writer.ts`) gets it by routing through the same assembler rather than by carrying its own copy. The product name in that stamp is the `agents-inc` spelling, matching the primary `bin` name and `CLI_INVOKE_COMMAND` — it is emitted content, so a rename has to change this string too. Note the asymmetry: the stamp goes on the TYPES half only. `config.ts` carries none, because it is the hand-editable half — the documented workflow is "edit `config.ts`, then compile", and `reconcileTypesFromDisk` treats the file on disk as the truth and never rewrites it.

### Union Emission Internals

The four narrowed unions (`SkillId`, `AgentName`, `Domain`, `Category`) in a standalone `config-types.ts` are rendered by a shared formatting stack in `config-types-writer.ts`. Each union is split into a **Custom** group and a **Marketplace** group and annotated with `// Custom` / `// Marketplace` section comments so a reader can tell user-authored entities apart from marketplace-installed ones.

| Function                                                        | Contract                                                                                                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatMaybeSectionedUnion(members, isCustom)`                  | Entry point per union. Empty → `EMPTY_UNION_TYPE`. No custom members → plain `formatUnion` (keeps single-line form while `quoted.length < MULTI_LINE_THRESHOLD`, = 6). Any custom members → `formatSectionedUnion`. |
| `formatSectionedUnion(custom, marketplace)`                     | Emits section comments. One group present → single header (`// Custom` **or** `// Marketplace`) with that group's members. Both groups present → custom block first, then marketplace block, always multi-line.     |
| `collectCustomDomains(matrix, customCategorySet, extraDomains)` | Applies the subtraction rule (below); returns the set of domains treated as custom.                                                                                                                                 |
| `buildSkillsByCategory(skillIds, categories, matrix)`           | Groups eligible skills into `Map<Category, SkillId[]>` for `generateStackAgentConfig`.                                                                                                                              |

`generateConfigTypesSource` first computes `customSkillSet`, `customAgentSet`, and `customCategorySet` (a member is custom when its matrix entry has `custom === true`, or it was passed as an `extras.*` addition), then calls `formatMaybeSectionedUnion` once per union with the matching membership predicate.

**`collectCustomDomains` — the subtraction rule.** A domain is custom only if it NEVER appears on a non-custom (marketplace) category. The function partitions matrix categories into marketplace (`!customCategorySet.has(key)`) and custom, collects the marketplace categories' domains into `marketplaceDomains`, then keeps only custom-category domains absent from that set. Explicitly-passed `extraDomains` are always folded in as custom. This prevents a domain that spans both a marketplace and a custom category from being mislabelled custom.

**`buildSkillsByCategory` — eligibility filter.** For each skill id it looks up `matrix.skills[id]?.category` and keeps only entries whose category is defined, is not `LOCAL_PSEUDO_CATEGORY` (`"local"` in `consts.ts`), and is in the passed `categories` set, then groups by category. The result drives `generateStackAgentConfig`, which emits a per-category-constrained `StackAgentConfig` — or the loose `STACK_AGENT_CONFIG_LOOSE_LINE` when the map is empty.

**`EMPTY_UNION_TYPE` handling.** The module-level constant `EMPTY_UNION_TYPE = "never"` is returned by `formatUnion`, `formatMaybeSectionedUnion`, and `formatSectionedUnion` for an empty member list. `never` is the union identity element: an empty install accepts no member, and a project union that extends an empty global union (`never | "web-framework-react"`) still narrows correctly. Emitting `string` instead would absorb every literal and silently disable type-checking of the generated `config.ts`. This matches `generateBlankGlobalConfigTypesSource`, which emits `never` for the same empty state.

## The config-gate

**Directory:** `src/cli/lib/config-gate/` — `index.ts` is its entire public surface.

Since 2026-08-02, writing `~/.claude-src/config.ts` and its `config-types.ts` sibling (together, **the global pair**) is this module's exclusive privilege. The reason is that the write owes consequences no caller can be relied on to remember: every registered project inlines a snapshot of the global config, so a global write leaves those snapshots stale until the change is fanned out, and their compiled agents stale until those projects are recompiled. Two audited gaps were exactly that — a project-context source migration in `edit` (propagated nothing) and a global `uninstall` (counted the propagated projects but never recompiled them). The gate carries out the consequences itself and hands the caller a `GateReport` to render.

| Private file     | Holds                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pair-writer.ts` | The only code that writes either half. `writeGlobalConfigHalf`, `writeGlobalTypesHalf`, `writeGlobalTypesHalfFromData`, `writeGlobalPair`, `ensureBlankPair`.                                                                                                                                                                                                 |
| `classify.ts`    | `classifyGlobalChange(prev, next) → GlobalChangeSet`, and the tier predicates that read it.                                                                                                                                                                                                                                                                   |
| `propagate.ts`   | `writeConfigFile`, `writeProjectConfigPair`, `propagateGlobalChangesToProjects`, `pruneGlobalEntriesFromRegisteredProjects`, `resolveEffectiveGlobalConfig`, `mergeGlobalConfigs`, `registerProjectPath`, `deregisterProjectPath`, `normalizeProjectPath`, `reconcileProjectSplitAgainstGlobal`, `buildProjectTypesExtras`, `buildConfigTypesBackgroundData`. |
| `recompile.ts`   | `recompilePropagated` — lazily imports `operations/project/recompile-project-agents.js` (a static import would form a load-time `lib → operations → lib` cycle).                                                                                                                                                                                              |
| `gate-token.ts`  | The `AsyncLocalStorage` write privilege: `withGateToken`, `hasGateToken`, `assertGateToken`, and the `GlobalPairWriteViolation` error.                                                                                                                                                                                                                        |
| `deps.ts`        | `GateDeps` — loaded matrix + agents, or lazy loaders that classification may decide never to call.                                                                                                                                                                                                                                                            |

### Consequence tiers

`classifyGlobalChange` diffs the config on disk against the config about to be written, over `JSON.parse(JSON.stringify(...))`-normalized forms so an explicitly-`undefined` field and an absent one compare equal. `consequenceTier` reduces the resulting `GlobalChangeSet` to the work owed:

| Tier   | Trigger                                                                                                                     | Pair halves written | Propagates | Regenerates project types | Recompiles | Loads matrix/agents |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------- | ------------------------- | ---------- | ------------------- |
| **T1** | skills added/removed/`source`-changed/otherwise changed, agents added/removed/changed, `stack`, `domains`, `selectedAgents` | both                | yes        | yes                       | yes        | yes                 |
| **T2** | scalars only (any key that is neither one of the five extracted fields nor `projects`)                                      | config half         | yes        | no                        | no         | matrix only         |
| **T3** | `projects[]` only                                                                                                           | config half         | no         | no                        | no         | no                  |
| **T4** | nothing moved                                                                                                               | none                | no         | no                        | no         | no                  |

T2 exists because project configs inline the global **scalars** verbatim (`generateConfigSource` emits `source`, `marketplace`, `sources`, `author` into project output), while no generated union is derived from them. A per-skill `source` change is T1, not T2: the compiled reference form depends on it (`<id>:<id>` for a marketplace-sourced skill, the bare id for an ejected one, D-217), so a source change that skipped the recompile would leave every registered project's agents naming a reference that no longer resolves. T3 is the reason a project `uninstall` stays offline — `resolveGateDeps` never calls the lazy loaders for a tier with no consequences.

### Public entry points

| Entry                                              | Used by                                                                                                       | What it writes                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `writeScopedFromWizard(args)`                      | `write-project-config.ts` (init/edit), `local-installer::writeConfigAndCompileAgents` (eject/plugin installs) | The scoped pair(s) — see the branches below                                           |
| `reconcileTypesFromDisk(dir, config, deps, opts?)` | `commands/compile.ts`                                                                                         | The types half only; `config.ts` on disk is the input and is never rewritten          |
| `writeScaffoldedEntityTypes(dir, data, extras?)`   | `new/skill.ts`, `new/agent.tsx`, `new/marketplace.ts`                                                         | The types half only, after a scaffolded entity widened the unions                     |
| `mutateGlobal(mutation, deps)`                     | `edit.tsx`, `uninstall.tsx`, `eject.ts`, `configuration/source-manager.ts`                                    | The global config half, then whatever the classification obliges                      |
| `propagateGlobalRemoval(preRemovalConfig, deps)`   | `uninstall.tsx` (GLOBAL uninstall)                                                                            | Nothing — the pair was just deleted; it prunes and recompiles the registered projects |
| `ensureBlankPair()`                                | `write-project-config.ts`, `eject.ts`                                                                         | Both blank halves at `~/.claude-src/`, only when `config.ts` is absent                |
| `writeProjectPartial(dir, partial, opts?)`         | `eject.ts`, `configuration/source-manager.ts`                                                                 | A PROJECT `config.ts` only; throws `GlobalPairWriteViolation` at `$HOME`              |
| `writeMarketplaceScaffoldConfig(dir, config, ...)` | `new/marketplace.ts`                                                                                          | A scaffolded marketplace's `config.ts`; throws `GlobalPairWriteViolation` at `$HOME`  |
| `lazyGateDeps(projectDir)`                         | `uninstall.tsx`, `eject.ts`, `source-manager.ts`                                                              | (loaders only) `matrixOnly: true, skipExtraSources: true` matrix + `loadAgentDefs`    |

`applyMigratedGlobalSources`, `mergeGlobalConfigs` and `normalizeProjectPath` are also exported, as pure functions the migration path, the merge documentation and any reader that must MATCH a `projects[]` entry refer to; none of them writes.

**Every entry that writes or drives a write opens the gate token around its whole flow (D-309)** — `writeScopedFromWizard`, `writeScopeConfigTypes`, `reconcileTypesFromDisk`, `writeScaffoldedEntityTypes`, `mutateGlobal`, `propagateGlobalRemoval`, `ensureBlankPair`. `propagateGlobalRemoval` is included even though it reaches only project pairs today: the rule is "a gate entry holds the privilege for its flow", not "the ones whose current implementation needs it". `writeProjectPartial` and `writeMarketplaceScaffoldConfig` are the two exceptions — both refuse `$HOME` as their first act and then write a project's or a marketplace's own config, which the tripwire never guards.

**`writeProjectPartial` normalizes the incoming stack (D-308).** Its callers all read with the LENIENT loader (`loadProjectSourceConfig`), which passes the on-disk stack through untouched, and the writer emits an exclusive category in its BARE form (`"web-framework": "web-framework-react"`, no array). On a load / re-emit round trip that bare value reaches `compactCategories`, which keeps only non-empty arrays — so the category was silently dropped and the user lost an assignment they never touched. The entry now runs `normalizeStackRecord` (the same call `loadProjectConfigFromDir` makes) before filling required fields. The static import is cycle-free because `config-gate/index.ts` already pulls `stacks-loader` in transitively through `configuration/project-config`.

### Enforcement — four layers

A bypass has to defeat all four:

1. **Module privacy (L1).** `installation/index.ts` and `configuration/index.ts` re-export no pair writer. `config-writer.ts` and `config-types-writer.ts` keep their renderers but no longer write; `config-saver.ts` is deleted. A stale `import { writeConfigFile } from "../lib/installation"` is now a TS2305 compile error.
2. **eslint (L2).** (a) `config-gate/*` is unimportable except `index*`, statically and — via a `no-restricted-syntax` `ImportExpression` selector — dynamically; (b) `writeFile`/`writeFileSync`/`appendFile`/`appendFileSync`/`outputFile` may not be imported from `fs`, `node:fs`, `fs/promises`, `node:fs/promises` or `fs-extra` anywhere in `src/**` outside `utils/fs.ts`; (c) `generateConfigSource`, `generateConfigTypesSource`, `assembleConfigTypesSource` and `regenerateConfigTypes` are import-restricted to `config-gate/**` and `configuration/**`. Tests and e2e are exempt from all three.
3. **Runtime tripwire (L3).** `src/cli/utils/fs.ts::writeFile` resolves its target and calls `assertGateToken` when it is either half of the pair. Every write in the CLI funnels through that function, and the check is a path comparison, so it catches a concatenated or variable-held path that no static rule can see. **Only `config-gate/index.ts`'s public entry points open the token (D-309)**, each around its whole consequence flow; `pair-writer.ts` and `propagate.ts` REQUIRE it and mint nothing. That is what makes the first three layers load-bearing rather than decorative: while `pair-writer` opened the token inside its own functions, any caller that reached that module — a dynamic import, a re-export — arrived already authorized and the tripwire had nothing to refuse. Authorization is now a property of how the write was ENTERED.
4. **Guard test (L4).** `src/cli/lib/__tests__/config-gate-enforcement.test.ts` (**23 specs** — this doc owns that count; no other doc may restate it) pins the barrel deletions by name, exercises the real (`importActual`) `utils/fs.writeFile` against both pair paths inside and outside `withGateToken`, asserts the three `$HOME` refusals, proves the private `pair-writer` refuses a caller that reached it by dynamic import (the D-309 spec — it both throws `GlobalPairWriteViolation` and leaves no `config.ts` behind), and runs a source scanner over `src/**` that fails any non-gate file matching BOTH a write primitive AND a pair reference — with a fixture self-test proving the scanner flags the canonical rogue snippet. The count is 23 executable specs, not 23 `it(` calls: two `it.each` blocks contribute two cases each (config half / types half, refused and gated).

The one residual bypass is a dynamic `import("node:fs")` with a fragment-concatenated path and an eslint-disable. That is three deliberate steps, not drift, and closing it would need process-wide `fs` interception.

## Writer Selection Rule

When writing a PROJECT `config-types.ts` (`<projectDir>/.claude-src/config-types.ts` where `projectDir` is not the global install root), the import-from-global writer `regenerateConfigTypes` applies. When writing the GLOBAL `config-types.ts` (`~/.claude-src/config-types.ts`), the standalone unions apply — and only `pair-writer.ts` may emit them. The former `writeStandaloneConfigTypes` helper no longer exists in any form: `grep` returns nothing, because `pair-writer.ts`'s private `renderStandaloneTypes` took its place and is unreachable from outside the gate.

| Write site                                                 | Target path                                   | config.ts writer                                             | config-types.ts writer                               |
| ---------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| `writeScopedFromWizard` — home branch                      | `~/.claude-src/config.ts` + types             | `writeGlobalPair`                                            | `writeGlobalPair` (same call, same config)           |
| `writeScopedFromWizard` — project branch, global write     | `~/.claude-src/config.ts` + types             | `writeGlobalPair`                                            | `writeGlobalPair` (same call, same config)           |
| `writeScopedFromWizard` — project branch, project write    | `<projectDir>/.claude-src/config.ts` + types  | `writeProjectConfigPair`                                     | `writeProjectConfigPair` → `regenerateConfigTypes`   |
| `propagateGlobalChangesToProjects` — per-project loop      | `<projectPath>/.claude-src/config.ts` + types | `writeProjectConfigPair`                                     | `writeProjectConfigPair` → `regenerateConfigTypes`   |
| `mutateGlobal` — after a transform                         | `~/.claude-src/config.ts`                     | `writeGlobalConfigHalf`                                      | (none — a scalar/registration change moves no union) |
| `reconcileTypesFromDisk` / `writeScopeConfigTypes` — home  | `~/.claude-src/config-types.ts`               | (none — types only)                                          | `writeGlobalTypesHalf`                               |
| `reconcileTypesFromDisk` / `writeScopeConfigTypes` — other | `<dir>/.claude-src/config-types.ts`           | (none — types only)                                          | `regenerateConfigTypes`                              |
| `writeScaffoldedEntityTypes` — home                        | `~/.claude-src/config-types.ts`               | (none — types only)                                          | `writeGlobalTypesHalfFromData`                       |
| `writeScaffoldedEntityTypes` — other                       | `<dir>/.claude-src/config-types.ts`           | (none — types only)                                          | `regenerateConfigTypes`                              |
| `ensureBlankPair`                                          | `~/.claude-src/config.ts` + types             | `generateBlankGlobalConfigSource`                            | `generateBlankGlobalConfigTypesSource`               |
| `writeProjectPartial`                                      | `<projectDir>/.claude-src/config.ts`          | `normalizeStackRecord` → `generateConfigSource` (no options) | (none)                                               |
| `writeMarketplaceScaffoldConfig`                           | `<marketplaceDir>/.claude-src/config.ts`      | `generateConfigSource` (no options)                          | (none)                                               |

**Write-if-changed.** Every pair write goes through `pair-writer.ts::writeIfChanged`, which skips the write when the file already holds exactly those bytes. Coherence between the two halves does not depend on it — both are always derived from the same config in the same call — but it keeps a projects-only or scalar-only change from churning the mtime of files other tools watch. The boolean a pair writer returns (`GateReport.globalWritten`) means "at least one half was actually rewritten", not "a write was attempted".

**`ensureBlankPair` writes both halves.** Its predecessor `ensureBlankGlobalConfig` wrote `config.ts` alone, whose first line is `import type { ProjectConfig } from "./config-types"` — so an `eject` at `~` with no prior install left a config that could not resolve its own types. This is a **behaviour change** landed with the gate; see the `eject` section of [commands/index.md](../commands/index.md).

### Config-types write sites outside the gate

There are none. Every caller below reaches a gate entry point, and `regenerateConfigTypes` itself throws at `$HOME`:

| Caller                                                       | Target                                         | Gate entry                   | Notes                                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Compile.refreshConfigTypes` (`src/cli/commands/compile.ts`) | the compiling pass's scope                     | `reconcileTypesFromDisk`     | Once per pass, including the `totalSkillCount === 0` early return. Failure warns. At home it also fans out. |
| `uninstall.tsx` (GLOBAL)                                     | every registered project                       | `propagateGlobalRemoval`     | Runs AFTER the global manifest removal so project types fall back to standalone.                            |
| `src/cli/commands/new/skill.ts`                              | `<projectDir>/.claude-src/config-types.ts`     | `writeScaffoldedEntityTypes` | Feature-gated command; passes the just-created skill as `extras`.                                           |
| `src/cli/commands/new/agent.tsx`                             | `<projectDir>/.claude-src/config-types.ts`     | `writeScaffoldedEntityTypes` | Feature-gated command; passes the just-created agent as `extras`.                                           |
| `src/cli/commands/new/marketplace.ts`                        | `<marketplaceDir>/.claude-src/config-types.ts` | `writeScaffoldedEntityTypes` | Feature-gated command; no extras. Its `config.ts` goes through `writeMarketplaceScaffoldConfig`.            |

`new skill` and `new agent` run at `process.cwd()`, which may be the home directory. That leg used to fall through to the raw writer's un-narrowed branch (unions covering the whole matrix); `writeScaffoldedEntityTypes` now reads the config off disk and narrows to it. `new marketplace` at `$HOME` is **refused** outright rather than merged — scaffolding there would replace the pair's config half with a config declaring one dummy skill. All three commands are behind compile-time feature flags that are off, so no user is affected today.

`regenerateConfigTypes` calls are fed already-loaded matrix/agent data via helpers in `config-gate/propagate.ts`:

- `buildConfigTypesBackgroundData(matrix, agents)` — wraps loaded matrix + agents into `ConfigTypesBackgroundData` (no re-load).
- `buildProjectTypesExtras(config, matrix)` — derives `extraSkillIds`, `extraAgentNames`, `extraCategories`, `extraDomains` from **every active (non-excluded)** entry of the config it is given, at either scope, plus that config's own `domains` array and stack category keys. The narrower project-only derivation left the project's unions unable to name the global rows `generateProjectConfigWithInlinedGlobal` writes into the sibling `config.ts`: they were covered only while the global unions still held them, so a later global-scope run that narrowed those unions turned an untouched project's generated config into a type error.

This rule was hardened under task D-228 (project-branch types must use `regenerateConfigTypes`) and D-282 (both project-pair write sites must feed `buildProjectTypesExtras` the same effective config — see `writeProjectConfigPair` below).

## `writeScopedFromWizard` Branches

**Signature:** `writeScopedFromWizard({ finalConfig, matrix, agents, projectDir, projectConfigPath, projectInstallationExists }): Promise<GateReport>` — the same six inputs the former `writeScopedConfigs` took, object-wrapped.

```
GateReport = {
  globalWritten: boolean            // at least one half of the global pair was actually rewritten
  changes: GlobalChangeSet          // what moved, as classify.ts saw it
  propagated: { updated: string[]; skipped: string[] }
  recompile: PropagatedRecompileSummary   // { recompiledCount, failedCount, warnings }
}
```

It is **not** `void`, and — unlike the `ScopedConfigWriteResult` it replaces — it is not a to-do list. The recompile named in `recompile` has already run by the time the promise resolves; the caller renders the report (D-240 as rewritten, below).

The function has a single top-level fork on `isHomeDirectory(projectDir)`. Every downstream branch below sits under one of the two top halves.

### Context detection — `projectInstallationExists` is a context flag, not a disk check

Both `writeScopedFromWizard` and its upstream callers compute the "does a project installation exist?" signal via `!isHomeDirectory(projectDir)`, whose body is the symlink-resolved comparison (with a plain-string fallback when a path cannot be resolved):

```
fs.realpathSync(projectDir) !== fs.realpathSync(os.homedir())
```

It is computed at these call sites in `config-gate/index.ts` / `local-installer.ts` / `write-project-config.ts`:

- `writeScopedFromWizard` re-derives it as `isHomeDirectory(projectDir)` for the global-vs-project fork, ignoring the passed-in `projectInstallationExists` for that decision — see "Parameter redundancy" below.
- `installPluginConfig` and `installEject` each compute it as `isProjectInstall` and thread it through `writeConfigAndCompileAgents` into the `projectInstallationExists` parameter.
- `writeProjectConfig` (operations layer, `src/cli/lib/operations/project/write-project-config.ts`) computes it as `isProjectContext` and passes it in.

**This is a context flag, not a disk check.** It returns `true` whenever `projectDir !== $HOME` after symlink resolution, regardless of whether `.claude-src/config.ts` actually exists on disk. A fresh `cc init` in a brand-new project directory sets the flag to `true` before any config file has been written. The variable name suggests disk presence but the implementation is "we are running inside a project, not from home".

Consequences for the project-branch skip:

```
if (projectInstallationExists || hasProjectItems) { /* write project config */ }
else { /* skipped */ }
```

In production the flag is always `true` for any `cc init` / `cc edit` invoked from a project directory — which is the only way to reach the project branch in the first place. The `else` branch is effectively unreachable from production entry points: if `isHomeDirectory(projectDir)` is true the function returned in the home branch above; otherwise `projectInstallationExists` is also `true` (same computation), so the guard short-circuits. The `|| hasProjectItems` half of the guard exists for unit tests that call the entry point directly with a mocked-out `projectInstallationExists = false` to exercise the project-items-only path.

**Debugger's trap:** if you are trying to observe the skip branch firing in a real scenario and cannot, it is because the flag is context-derived and always `true` in project-context calls. The skip branch is test-theatre surface area, not a runtime switch.

### Home branch (`isHomeDirectory(projectDir)`)

Taken when `projectDir === $HOME`. Four actions:

1. Load the config already on disk at `$HOME` via `loadProjectConfigFromDir(homeDir)` — the classification's `prev`.
2. `classifyGlobalChange(prior, finalConfig)` → `GlobalChangeSet`.
3. `writeGlobalPair(finalConfig, projectConfigPath, matrix, agents)` — both halves from one config, each written only if its bytes moved. The config half is standalone (no inlining preamble); the types half is the standalone unions narrowed to `finalConfig`.
4. `applyConsequences` — if the tier propagates and `finalConfig.projects?.length`, `propagateGlobalChangesToProjects` (no `currentProjectDir`, so every registered project is reached), then `recompilePropagated(updated)` when the tier regenerates types.

**Step 4 is reachable (was previously gated by a merger bug):** `mergeConfigs` used to drop the `projects` field from merged configs, so `cc edit` at HOME left `finalConfig.projects` `undefined`, the guard was falsy, and home-context propagation never fired. `mergeConfigs` now preserves `existingConfig.projects` (see [config-merger.md](./config-merger.md) → "`projects` Field Preservation" and finding `2026-07-18-mergeconfigs-projects-drop-fixed-docs-stale.md`).

### Project branch

Taken when `projectDir !== $HOME`. Splits the final config by scope and handles global and project halves separately.

**Global half** (steps 3–4 are delegated to the `resolveEffectiveGlobalConfig` helper, which returns `{ config, globalDataChanged, changed }`; step 2's load runs in the entry point and is passed into the helper as `existingGlobalConfig`):

1. `splitConfigByScope(finalConfig)` → `{ global, project }`. Global half = entries with `scope === "global"`. See [scope-split.md](./scope-split.md) for the full partition rules (tombstone routing, stack partitioning, delta pipeline).
2. Load existing global config via `loadProjectConfigFromDir(homeDir)`.
3. In `resolveEffectiveGlobalConfig`: if the global split has skills/agents, merge them into the existing global via `mergeGlobalConfigs` (deep-additive, never removes; also fill-only for `marketplace`/`source` — see [config-merger.md](./config-merger.md)); when there are no global items the existing config is used unchanged (`changed: false`).
4. Still in the helper: `registerProjectPath(mergedConfig, projectDir)` — adds the current project to the global `projects` array (normalized via `normalizeProjectPath`, stale entries filtered). `effective.changed = merged.changed || registration.changed`.
5. `classifyGlobalChange(existingGlobal?.config, effectiveGlobalConfig)` — the diff, taken against what is actually on disk.
6. If `effective.changed`, `ensureDir` then `writeGlobalPair(effectiveGlobalConfig, globalConfigPath, matrix, agents)`; otherwise verbose-log `"Global config unchanged, skipping write"`.
7. `applyConsequences(effectiveGlobalConfig, changes, deps, projectDir)` — propagation and recompile are driven by the **classification**, with `projectDir` passed as `currentProjectDir` so the current project is skipped in the loop.

**The propagation trigger changed here.** It used to be `mergeGlobalConfigs`' `globalDataChanged` flag; it is now the classified change set. That is strictly a superset of the old behaviour: the merge's flag was blind to a per-skill `source` change on an entry that already existed, which is precisely the T1 case whose compiled reference form would go stale. `mergeGlobalConfigs`' `changed` survives as `effective.changed`, gating only the write-skip.

**Project half:**

8. `reconcileProjectSplitAgainstGlobal(projectSplitConfig, effectiveGlobalConfig, matrix)` → `reconciledProjectConfig`. Without this the raw split goes straight to the inlining writer and a project-owned skill plus a colliding live global install both land as active entries (D-279 — see "Cross-Scope Reconciliation" below).
9. `hasProjectItems` is computed from the **reconciled** config (`reconciledProjectConfig.skills.length > 0 || reconciledProjectConfig.agents.length > 0`), not from the raw split — reconciliation only ever adds mask rows, so it can flip the guard true but never false.
10. If `projectInstallationExists || hasProjectItems`, `ensureDir` then `writeProjectConfigPair(projectDir, reconciledProjectConfig, effectiveGlobalConfig, matrix, agents)` — one call writing both halves from the same reconciled data.
11. Else: verbose-log "Skipped project config".
12. Return the `GateReport`.

### Parameter redundancy

The `projectInstallationExists` parameter is computed the same way as the entry point's own `isHomeDirectory(projectDir)` fork. In production it is always redundant. It is retained because:

- Unit tests mock `fs.realpathSync` to force the home and project branches independently of the passed-in flag.
- The `|| hasProjectItems` escape hatch in the project-half guard lets tests exercise the "project items only, no installation" path without faking disk state.

### `writeProjectConfigPair` — the single project-pair writer (D-282)

```
writeProjectConfigPair(projectDir, reconciledSplit, effectiveGlobal, matrix, agents, options?)
  writeConfigFile(reconciledSplit, getProjectConfigPath(projectDir), { isProjectConfig: true, globalConfig: effectiveGlobal })
  if (options.regenerateTypes === false) return
  regenerateConfigTypes(projectDir, Promise.resolve(buildConfigTypesBackgroundData(matrix, agents)),
                        buildProjectTypesExtras(inlinedProjectView(reconciledSplit, effectiveGlobal), matrix))
```

Both sites that emit a project pair call it: the project branch above (step 10) and the per-project propagation loop. That is the point. Each site previously fed `buildProjectTypesExtras` a different config — the wizard branch passed the full cross-scope `finalConfig`, propagation passed the project split alone, which holds no active global rows — so a project whose last write came through propagation got a `config-types.ts` declaring fewer literals than its sibling `config.ts` used. `inlinedProjectView` builds the effective view once (the project's reconciled rows unioned with everything the global config contributes: skills, agents, domains, stack) and both halves are derived from it in the same call, so they cannot describe different configs.

`options.regenerateTypes: false` is passed only by a T2 fan-out, where the config half carries a changed scalar and no union has moved.

## `propagateGlobalChangesToProjects`

**Purpose:** After a global-scope change, rewrite every registered project's `config.ts` (re-inlined global snapshot) and `config-types.ts` (import-from-global form).

**Callers — all three are inside `config-gate/`. No command calls it directly, and neither barrel re-exports it.**

1. `applyConsequences` — the shared tail of `writeScopedFromWizard` (both branches) and `mutateGlobal`. Fires when `consequenceTier(changes)` propagates (T1 or T2) and the effective global config has registered projects. In the project branch, `projectDir` is passed as `currentProjectDir` so the current project is skipped (it is already being written in the enclosing flow). T2 passes `{ regenerateTypes: false }`.
2. `reconcileTypesFromDisk` at the home directory — an **unconditional** fan-out (see below).
3. `pruneGlobalEntriesFromRegisteredProjects(globalConfig, matrix, agents)` — the global-uninstall fan-out (D-274), reached through the `propagateGlobalRemoval` entry point. It re-enters this same function with an EMPTIED global config (`{ ...globalConfig, skills: [], agents: [], selectedAgents: [] }`) and no `currentProjectDir`, so every global skill/agent reads as removed: inlined global rows and their tombstones drop out, `selectedAgents` and per-agent stack refs lose their global-only names/ids, and each project's `config-types.ts` is regenerated. `selectedAgents` must be emptied alongside the arrays because the project writer re-unions the global `selectedAgents` into the project's. Called from `uninstall.tsx::updateRegisteredProjects` AFTER the global `.claude-src` manifest is removed, so the regenerated project types fall back to the standalone form instead of importing a deleted global `config-types.ts`.

**Per-project loop logic:**

- **Skip current project.** If `currentProjectDir` is set and `projectPath === normalizeProjectPath(currentProjectDir)`, `continue` (no push). The normalization is hoisted out of the loop into a `currentNormalized` local.
- **Skip if stale.** `fileExists(projectConfigPath)` guard — if `<projectPath>/.claude-src/config.ts` is missing, the project is pushed to `skipped` and verbose-logged (not deregistered; stale entries accumulate until `registerProjectPath` filters them on the next global write).
- **Skip if load fails.** `loadProjectConfigFromDir(projectPath)` returning null (pushed, `continue`) or throwing (caught, pushed, verbose-logged) skips the project.
- **Reconcile the project split against the new global data.** `projectSplit` is the loaded project config with four fields reconciled — it is NOT a simple project-owned filter:
  - `skills`: `retainProjectOwnedSkills` — keeps project-scoped entries and drops any global tombstone whose masked global is no longer active (`globalHasActiveSkill`).
  - `agents`: `retainProjectOwnedAgents` — same rule for agents (`globalHasActiveAgent`).
  - `stack`: `retainReconciledStack` — prunes assignments referencing a global skill just removed at global scope (`computeRemovedGlobalSkillIds` from `projectConfig.skills` vs the new `globalConfig`); untouched projects get byte-identical output.
  - `selectedAgents`: `retainReconciledSelectedAgents` — drops names not backed by a project-owned active agent or a still-active global agent.
- **Self-heal, then re-mask.** `reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)` drops masks whose collision has cleared (`dropOrphanedDerivedMasks` for skills, `dropOrphanedDerivedAgentMasks` for agents — D-277) and then re-derives masks for live global entries the project still collides with (`maskCollidingGlobalSkills` / `maskCollidingGlobalAgents`). Self-heal runs first on both axes so a cleared collision is removed rather than immediately re-derived.
- **Overwrite the pair.** `writeProjectConfigPair(projectPath, projectSplit, globalConfig, matrix, agents, { regenerateTypes })` — the same writer the wizard's project branch uses, so both halves are derived from the same effective view (D-282, above). `regenerateTypes` is `false` only for a T2 (scalars-only) fan-out, where the config half carries the changed scalar and no union moved.

### Stack reconciliation — `computeRemovedGlobalSkillIds` + `retainReconciledStack` (D-233 Scenario C)

The `stack` field of `projectSplit` is not a simple filter — it is reconciled against the now-current global data so a project-scoped agent stops referencing a global skill that was just removed at global scope. Two helpers do this:

- `computeRemovedGlobalSkillIds(priorProjectSkills, globalConfig)` — returns the skill ids the project inherited from global scope that are **no longer active at global scope** AND that the project does **not** own at project scope. It keys on the pre-reconciliation `projectConfig.skills`: a just-removed global skill still appears there as a `scope: "global"`, non-excluded entry (the signal). Project-scoped skills and user-authored local skills (which carry no `SkillConfig` entry at all) are never in the set, so both are always preserved.
- `retainReconciledStack(stack, removedGlobalSkillIds)` — drops only assignments whose `id` is in `removedGlobalSkillIds`; every other assignment is kept verbatim, in order, with its `preloaded` flag untouched. Categories and agents left empty by the pruning are removed.

**Byte-identical-for-unaffected-projects invariant.** `retainReconciledStack` early-returns the **same** `stack` reference when `!stack || removedGlobalSkillIds.size === 0`. A propagation triggered by a global change that removes no skill the project references therefore yields an identical `stack` object, and the re-emitted `config.ts` is byte-for-byte unchanged. Only projects that actually referenced a removed global skill see a diff. This is what lets a single global edit fan out across every registered project without churning configs that were not affected.

**What `propagateGlobalChangesToProjects` itself rewrites:** only the two `.claude-src/*.ts` files (`config.ts` + `config-types.ts`). It never touches the project's `.claude/skills/` tree, and it never recompiles anything. The recompile is its caller's — which is always the gate.

### Propagated-project recompilation (D-240 — closed, contract rewritten 2026-08-02)

Propagation being config-only used to leave a registered project's compiled `.claude/agents/<name>.md` embedding a removed global skill until that project was next edited directly. The first fix returned the propagated directories and made the **caller** recompile them. That contract was itself the defect class: only `init.tsx` and `edit.tsx`'s wizard tail ever honoured it, so a project-context source migration in `edit` and a global `uninstall` (which counted the propagated projects and stopped) both left stale agents behind.

**The contract now:** a write that propagates recompiles the propagated projects' agents itself and returns a `GateReport`; the caller renders the report.

```
config-gate::applyConsequences
  -> propagateGlobalChangesToProjects(...)          [config pairs]
  -> recompilePropagated(propagated.updated)         [T1 only]
       -> recompilePropagatedProjectAgents(projectDirs)
            -> recompileRegisteredProjectAgents(dir)  [per project]
```

A report the caller may only log cannot go stale the way a to-do list can, and per-project failure isolation already lived in `recompilePropagatedProjectAgents`, so internalizing the recompile added no new failure mode. `recompile.ts` imports the operations module **lazily** (`await import(...)`) because a static `lib → operations` import would form a load-time cycle — the same rule `installEject`'s `copyLocalSkills` import follows.

**Ordering.** The propagated-project recompile now runs inside the write, before the command's own cwd compile. That is safe because skill files are final before every write path reaches it: `init` copies skills first, `edit` runs `executeMigration` first, and a plugin install hard-errors before the write (D-229).

`recompileRegisteredProjectAgents` (`src/cli/lib/operations/project/recompile-project-agents.ts`) compiles **project scope only** (`scopeFilter: "project"`) — the global agents were already recompiled by the triggering operation's own pass, and repeating a global pass per project would rewrite `~/.claude/agents` once per registered project for no gain. It passes `discoverInstalledSkills(projectDir).allSkills` explicitly, because the default fallback sees plugin skills only and would strip every global-local and project-local skill from the compiled output. Agent partials always come from the CLI itself, so no per-project marketplace resolution happens.

`recompilePropagatedProjectAgents(projectDirs)` loops sequentially with per-project failure isolation and returns `PropagatedRecompileSummary = { recompiledCount, failedCount, warnings }` — one project's unreadable config or broken template must not abort the loop. It is `GateReport.recompile` verbatim. Warnings are surfaced by the calling command.

**Per-command line formats differ and must be preserved.** `init.tsx` and `compile.ts` print `Recompiled agents in N registered projects`; `edit.tsx` prints `... registered project(s)`. Both forms are asserted by e2e page constants — a printer refactor that unifies them turns those specs red.

Finding: `.ai-docs/agent-findings/2026-07-18-propagation-skips-agent-recompile.md` (the original gap report).

**Dependency on `projects` field.** The whole flow is gated on `globalConfig.projects`. The array is maintained exclusively by `registerProjectPath` (during project-branch writes in `writeScopedFromWizard`) and the gate's `deregister-project` mutation (called from `uninstall`). `mergeConfigs` now preserves `projects` from the existing config, so a home-context `cc edit` retains a `finalConfig.projects` array and the home-branch propagation guard fires. The project branch was always reachable because it reads `projects` off `effectiveGlobalConfig`, which is built from a `...existing` spread that preserves the field.

### `reconcileTypesFromDisk` — why its fan-out is unconditional

`compile` refreshes the type unions from the config **already on disk**, which is the documented hand-edit workflow ("edit `config.ts`, then run `compile`"). The config half is therefore an input and is never rewritten — an e2e asserts byte-identity of the hand-edited file.

That also means there is no `prev` to diff against: a hand edit leaves no record of what it changed, so nothing can be classified. At the home directory the only safe assumption is that every registered project's inlined copy is stale, so the fan-out and the recompile run every time, and `compile` prints the `init`-format recompile line. At project and marketplace directories nothing is propagated — a project config is nobody else's input.

`compile` passes `currentProjectDir: cwd`, so when it runs inside a registered project the home pass skips that project; the project pass compiles its agents itself.

## Cross-Scope Reconciliation — `reconcileProjectSplitAgainstGlobal` (D-279)

**File:** `src/cli/lib/config-gate/propagate.ts`

One helper, called at **every** site that writes a project `config.ts` with the global config inlined. Both such sites now go through `writeProjectConfigPair`, so the enumeration is a two-row table and a third row cannot appear without a new caller of that writer:

| Write site                                                                | Reconciliation call                                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `writeScopedFromWizard` project branch (ordinary project `init` / `edit`) | `reconcileProjectSplitAgainstGlobal(projectSplitConfig, effectiveGlobalConfig, matrix)` |
| `propagateGlobalChangesToProjects` per-project loop                       | `reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)`                |

Both call it BEFORE `writeProjectConfigPair`, not inside it — reconciliation needs the split each site derives its own way (a scope split from the wizard, a retain-and-prune pass from the loaded project config in propagation).

Before D-279 only the propagation site reconciled, and only on identity. The wizard's project-branch site performed none at all, so a project owning a skill at project scope while the same id was already active globally got TWO active entries in its own `config.ts` with no propagation involved. `doctor` reported the install clean and `validate` exited 0, because neither checks config semantics.

### Composition

```
reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)
  healedSkills = dropOrphanedDerivedMasks(projectSplit.skills, matrix)
  healedAgents = dropOrphanedDerivedAgentMasks(projectSplit.agents)
  skills = [...healedSkills, ...maskCollidingGlobalSkills(healedSkills, globalConfig, matrix)]
  agents = [...healedAgents, ...maskCollidingGlobalAgents(healedAgents, globalConfig)]
```

Self-heal runs BEFORE masking on both axes, so a mask whose collision has cleared is removed rather than immediately re-derived, and masking's `alreadyTombstoned` guard only sees tombstones that are still warranted.

### The collision test — `buildProjectCollisionTest`

Shared by the mask producer and the self-heal so the two can never disagree about what a mask means. It closes over the project's OWN entries and returns `(id: SkillId) => boolean`:

| Kind         | Condition                                                                                                                               | Applies to     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **IDENTITY** | The project holds an active project-scope entry for the same id / name.                                                                 | skills, agents |
| **CATEGORY** | The project holds a different active project-scope skill in the same category AND the merged matrix declares that category `exclusive`. | skills only    |

Agents have no categories, so `maskCollidingGlobalAgents` / `dropOrphanedDerivedAgentMasks` are identity-only.

### Invariants

| Invariant                           | How it holds                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Idempotent                          | `maskColliding*` skips ids/names already in `alreadyTombstoned`.                                                                                                                                       |
| Honours source-repo overrides       | `isExclusiveCategory(category, matrix)` reads `matrix.categories[category]?.exclusive`, not `defaultCategories`.                                                                                       |
| Undeclared flag is non-exclusive    | `?.exclusive === true`. A rule that masks persisted entries must only fire on a flag the data actually carries — deliberately unlike `build-step-logic.ts`'s `cat.exclusive ?? true` renderer default. |
| Never throws on custom skills       | `categoryOfSkill` returns `undefined` for an id absent from the matrix and for `LOCAL_PSEUDO_CATEGORY`; neither participates in category rules.                                                        |
| Never writes into the global config | Masking is applied to the project split only. The `globalConfig` argument is read, never rewritten — a tombstone never belongs in `~/.claude-src/config.ts`.                                           |
| The mask carries the global source  | Masks are built as `{ ...globalEntry, excluded: true }`.                                                                                                                                               |

**The project's own skill wins locally.** Deliberately asymmetric with `toggleTechnology`'s exclusive-swap guard, which refuses a user-initiated swap over a globally locked skill: there the user is displacing a shared install, whereas here a global install landed on top of existing project state and letting it win would silently uninstall the user's own skill. Relaxing the wizard-side guard is tracked as D-276.

### Mask lifetime

Since D-277 no store path can mint a BARE global tombstone: a project-scope deselect of a globally installed item is refused, and a domain deselect only drops what the project owns. The single remaining user route (`s`, G→P) always pairs the tombstone with an active project entry — an identity collision. Every bare mask is therefore machine-derived by construction, and one retention test suffices: **keep a mask only while the collision that would re-derive it still holds**, in `required` and optional categories alike.

This generalised the earlier `dropOrphanedDerivedMasks` rule, which was narrowed to categories that were both `exclusive` and `required` purely because a derived mask and a deliberate exclusion were byte-identical on disk. After D-277 they no longer coexist, so the narrowing and its trade-off paragraph are gone.

Findings: `2026-07-29-project-config-written-by-two-paths-only-one-reconciled.md`, `2026-07-29-category-exclusivity-enforced-only-in-a-keypress-handler.md`, `2026-07-29-derived-mask-and-user-tombstone-are-indistinguishable.md` (superseded by `2026-07-30-d277-global-immutability-collapses-tombstone-provenance.md`).

## `projects` Field Lifecycle

The `projects: string[]` field on the GLOBAL `ProjectConfig` at `~/.claude-src/config.ts` is the registry of every project directory that has invoked `cc init` / `cc edit` and triggered a global write. It drives `propagateGlobalChangesToProjects` — the per-project types/config fan-out on global edits. Only the gate reads or writes the field; every function below lives in `src/cli/lib/config-gate/propagate.ts`.

### Ownership

| Function                                       | Operation             | Trigger                                                                                                            | Persists field? |
| ---------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------- |
| `registerProjectPath`                          | Append + stale-filter | `writeScopedFromWizard` project branch, via `resolveEffectiveGlobalConfig` (every project-context write)           | Yes             |
| `mutateGlobal({ kind: "deregister-project" })` | Remove                | Every PROJECT `uninstall` (`src/cli/commands/uninstall.tsx`) — unconditional since D-274                           | Yes             |
| `propagateGlobalChangesToProjects`             | Read-only             | Post-global-write in `applyConsequences`, in `reconcileTypesFromDisk` at home, and in the global-uninstall fan-out | No              |

**D-274 changed the deregister trigger.** `uninstall --all` no longer exists; plain `uninstall` does what `--all` used to do, and the config manifest (`.claude-src/config.ts` + `config-types.ts`) is removed unconditionally, with `.claude-src/` itself removed once empty. A project uninstall therefore ALWAYS deregisters. The call is wrapped in a `try/catch` that warns (`"Could not update the global project registry: ..."`) — a missing, project-less, or corrupt (`ConfigLoadError`) global config must never fail the uninstall. A GLOBAL uninstall does not deregister; it runs `propagateGlobalRemoval` (→ `pruneGlobalEntriesFromRegisteredProjects`) instead.

**The deregistration is classified T3, which is why the uninstall stays offline.** `uninstall.tsx` hands `mutateGlobal` the `lazyGateDeps(projectDir)` loaders rather than a loaded matrix; a `projects[]`-only change propagates nothing, so `resolveGateDeps` never calls them and nothing is fetched. The types half is not rewritten either — no union is derived from the registration list, so the derived content would be byte-identical and `writeIfChanged` would skip it anyway.

`propagate.ts` still carries a standalone `deregisterProjectPath(projectDir)`. It is on **no production path** since the gate landed — `mutateGlobal`'s `deregister-project` variant replaced it at the only call site — and is reachable from tests only. Since D-309 it no longer opens the gate token for its one config-half write: private code does not mint the privilege, and with no public entry left to move the mint up to, its remaining (spec) callers wrap the call in `withGateToken` themselves.

No other code in the project writes `globalConfig.projects`. `generateConfigSource` in `config-writer.ts` strips `projects` from PROJECT config output via the shared `cleanForEmission(config, { dropProjects })` helper — a single `delete cleaned.projects` gated on `dropProjects`. The two project-config writers pass `dropProjects: true` (the inlined-global path cleans BOTH the project config and the inlined global snapshot; the global-import path cleans the project config), while the standalone writer passes `dropProjects: false`. The field is therefore emitted only in the GLOBAL (standalone) config source.

### Path normalization — `normalizeProjectPath`

Every value compared against `projects[]` goes through **one helper** in `src/cli/lib/config-gate/propagate.ts`:

```
normalizeProjectPath(projectDir) -> fs.realpathSync(projectDir)
```

| Site                                                      | What it normalizes                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `registerProjectPath`                                     | The path matched against, and appended to, `projects[]`                  |
| `mutateGlobal({ kind: "deregister-project" })`            | The path the `projects[]` filter removes (`applyMutation` normalizes it) |
| `deregisterProjectPath` (gate-internal, no longer called) | The path the `projects[]` filter removes                                 |
| `propagateGlobalChangesToProjects` — current-project skip | `currentProjectDir`, compared against each `projects[]` entry            |

**Rule going forward: any site that matches a directory against the `projects[]` registry MUST call `normalizeProjectPath` and must not roll its own normalization.** Entries are written and read back under a single rule, so a path stored by one site matches byte-for-byte at the others. The helper is exported from `propagate.ts` but that module is gate-private and `config-gate/index.ts` does not re-export it, so a new site either lives inside `config-gate/` or forces a deliberate widening of the gate's public surface — which is the point at which the rule gets re-examined rather than silently forked.

**Scope of the rule.** It governs the `projects[]` registry only. `isHomeDirectory` (`src/cli/lib/installation/is-home-directory.ts`) also compares symlink-resolved directories, but against `$HOME` rather than against a persisted registry, and it keeps its own plain-string `catch` fallback. Do not unify the two — nothing `isHomeDirectory` compares was ever written to disk under a normalization that must be matched later.

**Single rule, no fallback tier — deliberate, not an oversight.** `normalizeProjectPath` THROWS when the directory does not exist; there is no `path.resolve` second tier. Finding `2026-07-25-register-deregister-path-normalization-asymmetry.md` proposed precisely that fallback ("normalize with `fs.realpathSync` ... falling back to `path.resolve` only if the path no longer exists on disk"), and it was **deliberately not implemented**. A two-tier resolution chain is banned by CLAUDE.md's Data Integrity rule ("NEVER build multi-tier resolution fallbacks ... Data matches on the first lookup or it's an error"), so building it would have placed the banned pattern inside the very helper written to unify the rule — the second tier is exactly where the asymmetry would grow back. Do NOT restore the fallback believing it was overlooked: see that finding's **Resolution Note** and finding `2026-07-30-finding-proposed-standard-contradicted-a-never-rule.md`.

**Where the throw lands.** The helper is reached late on every path, so a non-existent directory degrades rather than crashing an operation mid-write:

| Caller                                                    | Reached only after                                                                                                             | On throw                                                                                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `registerProjectPath`                                     | n/a — normalizes first                                                                                                         | Propagates; the directory is the one currently being written to, so it exists                                                                                                                                      |
| `mutateGlobal({ kind: "deregister-project" })`            | the `loadProjectConfigFromDir(homeDir)` global-config load AND the `projects.length === 0` early return inside `applyMutation` | Propagates uncaught to the **pre-existing** warn-and-continue guard in `executeUninstall` (`src/cli/commands/uninstall.tsx`): `Could not update the global project registry: <reason>`. The uninstall never fails. |
| `propagateGlobalChangesToProjects` — current-project skip | the `projects.length === 0` early return, and only when `currentProjectDir` was passed                                         | Propagates to the caller (`writeScopedFromWizard`); the directory is the project being installed, so it exists                                                                                                     |

### `registerProjectPath` — stale-filter semantics

Normalization: `normalizeProjectPath(projectDir)` — `fs.realpathSync`, resolves symlinks (see above).

Stale-filter pass: before appending, every entry in the existing `projects` list is tested with `fileExists(<entry>/.claude-src/config.ts)`. Missing files are dropped. This is the only place stale entries are collected — they accumulate in the global config across sessions and are swept on the next project-context write.

Append rule:

- If the normalized current path is already in the filtered list, skip the append. `changed` is true iff any stale entry was removed this pass.
- Otherwise append the normalized path. `changed` is always true.

The stale filter does not warn, error, or deregister — it silently drops. A project that was deleted on disk without `cc uninstall` has its global registration harvested on the next unrelated project write.

### Deregistration — removal semantics

Since the gate landed, deregistration is `mutateGlobal({ kind: "deregister-project", projectDir })`; the semantics below are unchanged and now live in `applyMutation`'s `deregister-project` case plus the shared `mutateGlobal` write. (The older standalone `deregisterProjectPath` still compiles inside `propagate.ts` with the same rules, but nothing in production calls it.)

Normalization: `normalizeProjectPath(projectDir)` — `fs.realpathSync`, resolves symlinks. The **same** helper `registerProjectPath` stored the entry under, so the filter matches.

**Normalization asymmetry — CLOSED. Do not reintroduce it.** The deregister path previously normalized with `path.resolve`, which does not resolve symlinks, while `registerProjectPath` stored `fs.realpathSync`. Where a symlink sat above the project root the registered entry (realpath) never matched the deregister input, so the deregister was a silent no-op — the exact "registry keeps propagating into an uninstalled project" failure D-274 set out to prevent. On Linux with no symlinked ancestor the two agreed, which is why the Linux E2E coverage passed throughout; macOS (`/tmp` → `/private/tmp`) and any `~/dev/repo` → `/data/repo` layout leaked registrations forever.

**The invariant that now holds:** all three registry sites call the single `normalizeProjectPath` helper (see "Path normalization" above), so there is one implementation of the rule and no second one to drift against. This entry is kept rather than deleted because the constraint is invisible in the fixed code — a future edit that inlines `path.resolve` at either end reads as harmless and silently restores the defect.

The general rule, still binding: **a value written to config under one normalization must be read back and filtered under the same normalization.** See findings `2026-07-25-register-deregister-path-normalization-asymmetry.md` (status `resolved`; its Resolution Note records the deliberately-omitted fallback tier) and `2026-04-21-d233-projects-normalization-asymmetry.md` (the original report, filed three months earlier against the same two functions; status `superseded`, linked to the 2026-07-25 finding in both directions as of 2026-07-30).

> **Correction (2026-07-30):** this paragraph previously described the 2026-04-21 finding as "still marked `partial` on disk, and its `partial_note` describing `path.resolve` as current code is now stale". That was accurate when written and has since been acted on — the finding is now `superseded`, and the false `partial_note` (which also pinned two line numbers that had both moved) was removed rather than rewritten. The two findings had never been cross-linked, which is why resolving one left the other asserting a live bug; see `2026-07-30-sibling-finding-left-open-when-its-duplicate-was-resolved.md` for the proposed pipeline rule.

Filter rule: removes any `projects` entry equal to the normalized path. Writes the updated global config only if the filter actually shortened the array (`applyMutation` returns `null` otherwise, and `mutateGlobal` reports a no-op). Early-returns silently if no global config exists or `projects` is empty.

Does NOT reach `propagateGlobalChangesToProjects` — deregistration classifies T3, and a T3 change is not propagated. Deregistration is a pure removal and does not rebuild other projects' configs.

### `propagateGlobalChangesToProjects` — filter/skip semantics

Per entry in `globalConfig.projects`:

| Condition                                            | Action                                                        | Observable                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| `projectPath === currentNormalized`                  | Skip (no pushed entry)                                        | Silent (it is already being written in the enclosing flow) |
| `<projectPath>/.claude-src/config.ts` missing        | Push to `skipped`, verbose-log                                | Verbose only                                               |
| `loadProjectConfigFromDir(projectPath)` returns null | Push to `skipped`, continue                                   | Silent                                                     |
| `loadProjectConfigFromDir` throws                    | Push to `skipped`, verbose-log, continue                      | Verbose only                                               |
| Load succeeds                                        | Write both `config.ts` + `config-types.ts`, push to `updated` | Verbose only                                               |

The function never throws and never deregisters stale entries — a skipped project remains in `globalConfig.projects` until `registerProjectPath` sweeps it on the next project-context write. The two sets are returned as `{ updated: string[]; skipped: string[] }`. Whether `skipped` reaches the user depends entirely on which caller invoked the function (below).

### Propagation observability — command-dependent

Since the gate landed, both sets travel to every caller in the same shape (`GateReport.propagated`). What differs is which command renders which field. Two of the four rendering surfaces name `skipped`; two still drop it.

| Command surface                                              | Reads `updated`                                                      | Reads `skipped`                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `init.tsx::reportPropagatedRecompile`                        | `updated.length === 0` early-return, then the recompile summary line | **No** — never referenced                                                           |
| `edit.tsx::reportPropagatedRecompile`                        | same                                                                 | **No** — never referenced                                                           |
| `compile.ts::reportPropagation`                              | `updated.length === 0` early-return, then the recompile summary line | **Yes** — one `this.warn(registeredProjectUpdateSkipped(path))` per skipped project |
| `uninstall.tsx::updateRegisteredProjects` (global uninstall) | `updated.length > 0` → `logSuccess(registeredProjectsUpdated(n))`    | **Yes** — one `this.warn(registeredProjectUpdateSkipped(path))` per skipped project |

So a skipped project is **user-visible on a global uninstall and on `compile`**, and **invisible on every init/edit propagation**. The gate's `verbose()` aggregate (`Propagated global changes to N project(s)`) fires on every path.

**Per-branch user-visible signal on the init/edit paths.** `verbose()` only prints when the user passed `--verbose`. Without that flag, every skip branch is invisible and the process exit code is unaffected — the gate resolves normally regardless of skip count.

| Skip branch                                                         | `verbose()` log line                                                        | User-visible without `--verbose` | Exit code impact | Return-value signal                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------- | ---------------- | ------------------------------------------------------ |
| `fileExists(projectConfigPath)` false (config.ts missing on disk)   | `"Skipped propagation to ${projectPath} (config not found)"`                | No (uninstall path: **yes**)     | None             | Pushed to `skipped`; warned only on the uninstall path |
| `loadProjectConfigFromDir` returns `null`/no `config`               | None — push-and-`continue` with no log                                      | No (uninstall path: **yes**)     | None             | Pushed to `skipped`; warned only on the uninstall path |
| `loadProjectConfigFromDir` throws (or any writer throws downstream) | `"Failed to propagate to ${projectPath}: ${message}"` (caught)              | No (uninstall path: **yes**)     | None             | Pushed to `skipped`; warned only on the uninstall path |
| Happy path — writes succeed                                         | `"Propagated global changes to ${projectPath}"` + aggregate count at caller | No                               | None             | Pushed to `updated`                                    |

Note the `loadProjectConfigFromDir` throw branch now also covers `ConfigLoadError` (D-273): a registered project whose `config.ts` is corrupt is caught by the per-project `try`, pushed to `skipped`, and never aborts the fan-out.

**What this means for the user.** On `init` / `edit`, a project that fell out of propagation — directory deleted, config manually removed, or parse failure — produces no standard-output warning, no non-zero exit, and no persistent marker. The project remains in `globalConfig.projects` (the per-loop skip does NOT deregister), so it is retried on the next global write. The stale-filter sweep in `registerProjectPath` harvests entries whose `config.ts` is missing, but only on the _next_ project-context write. On a global `uninstall` the same skip is named explicitly.

**What this means for a debugger.** Reproducing a silent skip on the init/edit paths requires `--verbose` or direct inspection of `skipped` in a unit test. E2E tests that assert propagation succeeded (e.g., `e2e/lifecycle/project-tracking-propagation.e2e.test.ts`) verify `updated` side effects on disk, not `skipped`. A regression that causes all registered projects to silently skip would still pass every test that only checks `updated` for the current project and the exit code.

**Gap summary.** On the `init` and `edit` paths there is still no standard-output warning, no non-zero exit, no persistent marker, and no E2E assertion that a skipped project fell out of propagation — even though the gate now hands them the `skipped` list. See finding `.ai-docs/agent-findings/2026-04-21-propagation-skipped-observability-gap.md`; `compile` and `uninstall` are the pattern the other two could adopt, and adopting it is now a four-line printer change rather than a plumbing change.

**No pre-existing ticket covers this observability gap.** D-216 (`todo/D-216-global-config-propagation.md`) tracks the propagation feature mechanics (scope defaults, standalone-vs-import-and-extend types at the project branch). The `mergeConfigs`-drops-projects finding (`.ai-docs/agent-findings/2026-04-18-mergeConfigs-drops-projects-field.md`, now fixed — see `2026-07-18-mergeconfigs-projects-drop-fixed-docs-stale.md`) tracked one historical reason home-context propagation did not fire, but not the missing signal when per-project skips occur. The normalization-asymmetry findings (`2026-04-21-d233-projects-normalization-asymmetry.md`, `2026-07-25-register-deregister-path-normalization-asymmetry.md`) cover a register/deregister path mismatch — now closed by `normalizeProjectPath` — not the runtime-skip visibility. See finding `.ai-docs/agent-findings/2026-04-21-propagation-skipped-observability-gap.md` for the proposed remediation options.

### Registration observability

Same architectural class as Propagation observability above (silent drop, caller cannot distinguish, no user signal), different trigger surface. `registerProjectPath`'s stale-filter sweep harvests `projects` entries whose `<entry>/.claude-src/config.ts` is missing on disk. The sweep is the only place stale entries are collected — it runs on every project-context write to global config.

**What gets dropped.** Any `projects` entry whose joined `<entry>/<CLAUDE_SRC_DIR>/<STANDARD_FILES.CONFIG_TS>` fails `fileExists`. Cause is deterministic-only: the config file is absent from disk. Causes in practice: project directory deleted without running `uninstall`, `.claude-src/` manually removed, or path renamed on disk after registration. A fourth cause — a symlinked project whose deregistration silently no-op'd — is **historical only**: the normalization asymmetry that produced it is closed (see "Path normalization" above), so no new such entries are created; a registry written before the fix may still carry one, and the sweep harvests it like any other.

**How many are dropped.** The count is computed implicitly as `existing.length - valid.length` but is never stored, returned, or logged. The returned `changed` flag collapses "N stale entries swept" and "current path was appended" into a single boolean — callers cannot distinguish a sweep from an append.

**User-visible signal.**

| Surface                                  | Signal on sweep                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Inside-loop log (`verbose()` / `warn()`) | None — the filter has zero log statements                                                                                                      |
| Return value                             | Dropped count not returned; `changed` is a union of "swept" + "appended"                                                                       |
| Caller (`resolveEffectiveGlobalConfig`)  | Folds `registration.changed` into `effective.changed`, which gates only the write-skip. Never branches on sweep-vs-append.                     |
| Standard output                          | None                                                                                                                                           |
| Exit code                                | None — the gate resolves normally. `GateReport.changes.projectsChanged` is a boolean that fires for a sweep and an append alike, never a count |
| Persistent marker                        | None — the entry is removed from the next-written global config silently                                                                       |

**What this means for the user.** A project that fell off disk is harvested from `globalConfig.projects` on the next unrelated project-context write. Nothing tells the user the registry shrank. If the user later restores the project directory or moves it back, they must re-run `cc init` / `cc edit` from inside it to re-register — the stale sweep gives no warning that this step is needed.

**What this means for a debugger.** There is no way to observe the sweep from outside without diffing `globalConfig.projects` across writes. The `changed: true` return value fires for both "appended normalized path" and "swept N stale entries" and the writer runs unconditionally in either case, so inspecting the write path cannot localize the cause.

**Relation to propagation observability.** The two observability gaps are complementary: `propagateGlobalChangesToProjects` silently skips per-project when `config.ts` is missing but never deregisters; `registerProjectPath` silently deregisters those same entries on the next project-context write. A project that went missing experiences a skipped-propagate run first, then (potentially much later) an unnoticed sweep. Neither event produces a user-visible signal. See finding `.ai-docs/agent-findings/2026-04-21-registerProjectPath-sweep-observability-gap.md` for the remediation options.

### `projects` Preservation Across the Merge Paths

`mergeConfigs` in `src/cli/lib/configuration/config-merger.ts` builds `const merged = { ...newConfig }` and copies `existingConfig.projects` forward via `if (existingConfig.projects && !newConfig.projects)`. `newConfig` originates from `buildEjectConfig`, which never sets `projects`, so the guard always fires when the existing global config had registrations. Every write path now preserves the field.

| Write path                                     | Goes through `mergeConfigs`?                                            | `projects` preserved? | Propagation reachable? |
| ---------------------------------------------- | ----------------------------------------------------------------------- | --------------------- | ---------------------- |
| `writeScopedFromWizard` project branch, global | No — uses `mergeGlobalConfigs` with `{ ...existing, ... }` spread       | Yes (via spread)      | Yes                    |
| `writeScopedFromWizard` home branch            | Yes — `buildAndMergeConfig → mergeConfigs` before the gate is called    | Yes (guard copies it) | Yes                    |
| `registerProjectPath` output                   | No — direct `{ ...globalConfig, projects: [...] }` spread               | Yes                   | n/a (writes only)      |
| `mutateGlobal` output                          | No — `applyMutation` spreads the loaded config and overwrites one field | Yes                   | Per tier               |

Registration and deregistration load GLOBAL config fresh from disk via `loadProjectConfigFromDir(homeDir)`, spread the full loaded object, overwrite only `projects`, and write the config half — they never invoke `mergeConfigs`.

Since D-273 that load THROWS `ConfigLoadError` on a corrupt global config instead of returning `null`. `mutateGlobal` does not catch it — `uninstall.tsx` wraps the call and warns, so a corrupt global config degrades to "registry not updated" rather than a failed uninstall. `writeScopedFromWizard` does NOT wrap its `loadProjectConfigFromDir(homeDir)` (used both as the classification's `prev` and as `resolveEffectiveGlobalConfig`'s input), so a corrupt global config aborts a project write before anything is persisted.

**History:** the home-context path previously dropped `projects` in `mergeConfigs`, making the `if (finalConfig.projects?.length)` propagation guard vacuously falsy for a `cc edit` at HOME. That is fixed (finding `2026-07-18-mergeconfigs-projects-drop-fixed-docs-stale.md`); the earlier D-228 "vacuous pass" E2E workaround in `.ai-docs/agent-findings/2026-04-21-d228-e2e-vacuous-pass-via-home-edit.md` is the historical record.

## `buildProjectTypesExtras`

**Purpose:** Derive the four extras that `regenerateConfigTypes` needs to extend the global unions with project-only additions.

**Filters.** The function keeps every **non-excluded** entry of the config it is handed, at either scope — `skills.filter(s => !s.excluded)` and `agents.filter(a => !a.excluded)`, not a project-scope predicate. Excluded tombstones are dropped; their type flows in from the global union instead of being re-declared as a project-local extra.

The scope-blind filter is deliberate and is the fix recorded as the 2026-08-02 extras widening: `generateProjectConfigWithInlinedGlobal` writes the active global rows into the project's own `config.ts` verbatim, and the imported `Global*` unions cover those rows only while the global config still happens to hold them. A later global-scope run that narrowed those unions turned an untouched project's generated config into a type error (TS2322 on a skill id or domain, TS2353 on a stack category key).

**What it is handed matters as much as what it keeps.** The two project-pair write sites pass `inlinedProjectView(reconciledSplit, effectiveGlobal)` via `writeProjectConfigPair` — the project's own reconciled rows unioned with everything the global config contributes (D-282). `writeScopeConfigTypes`'s non-home leg passes the config it was given directly.

**Derivation rules.** Returns `Required<ConfigTypesExtras>`; the two derived sets go through the shared exported helpers in `config-types-writer.ts`, not inline expressions:

| Extra             | Source                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extraSkillIds`   | `unique(activeSkills.map(s => s.id))`                                                                                                                                        |
| `extraAgentNames` | `unique(activeAgents.map(a => a.name))`                                                                                                                                      |
| `extraCategories` | `unique([...deriveCategories(extraSkillIds, matrix), ...stackCategories(config.stack)])` — matrix-derived categories PLUS the category keys the emitted stack actually holds |
| `extraDomains`    | `unique([...deriveDomains(extraCategories, matrix), ...(config.domains ?? [])])` — matrix-derived domains PLUS the config's own `domains` array                              |

**Why the stack keys and the `domains` array are unioned in.** `domains` is a wizard preference no skill row has to back, and neither it nor a stack entry is pruned when the last skill that would derive it leaves. Deriving either from the skill rows alone therefore under-declares the unions relative to what the sibling `config.ts` emits.

**Category/domain derivation via matrix lookup.** Categories and domains are not stored on `SkillConfig` — they are attributes of the matrix entry keyed by skill ID. The derivation walks:

```
SkillConfig.id  -->  matrix.skills[id].category  -->  matrix.categories[category].domain
```

The `"local"` category is excluded because it is a catch-all sentinel, not a real narrowed type. A skill whose matrix entry is absent (optional-chaining to `undefined`) is silently dropped — in practice all skill IDs should resolve against the merged matrix, and absence indicates a stale config; the silent drop is defensive.

The `deriveDomains` half is category-sourced, not skill-sourced: it maps over `extraCategories` (already deduped and de-"local"'d), not over the skill rows.

## `buildConfigTypesBackgroundData`

Simple passthrough wrapper. Accepts an already-loaded `matrix` and `agents` record, returns `ConfigTypesBackgroundData` = `{ matrix, agentNames, customAgentNames }` where:

- `agentNames = typedKeys(agents)`
- `customAgentNames = agentNames.filter(name => agents[name]?.custom === true)`

`regenerateConfigTypes` accepts its background data as a promise. The gate's call sites (`writeProjectConfigPair`, `writeScopeConfigTypes`'s non-home leg) wrap the synchronous helper output in `Promise.resolve(...)` because no background loading is needed — the matrix and agents are already resolved, either handed in by the caller or loaded once by `resolveGateDeps`. Only `new marketplace` still passes a genuinely deferred `loadConfigTypesDataInBackground(...)` promise.

## Config-to-Compile Bridge — `buildCompileAgents` / `buildAgentScopeMap`

**File:** `src/cli/lib/installation/local-installer.ts`

After `writeScopedFromWizard` persists `config.ts`, the same final `ProjectConfig` is converted into the shape the agent compiler consumes. Both helpers are called from the shared install tail `writeConfigAndCompileAgents`: `buildCompileAgents(finalConfig, agents)` fills `CompileConfig.agents`, and `buildAgentScopeMap(finalConfig)` is threaded into `compileAndWriteAgents`. This is the bridge from the persisted config (source of truth) to the compiler's per-agent skill inputs.

### `buildCompileAgents(config, agents)`

Returns `Record<string, CompileAgentConfig>` (`CompileAgentConfig = { skills?: SkillReference[] }`, `src/cli/types/config.ts`). It emits one entry per **active** agent — `config.agents` filtered to `!excluded`, then further filtered to names present in the loaded `agents` record. For each agent it reads `config.stack?.[name]`; a missing stack yields `{}` (no skills). Otherwise it expands the stack via `buildSkillRefsFromConfig` (`src/cli/lib/resolver.ts`, returns `SkillReference[]`) and applies two filters plus one enrichment:

| Step                      | Rule                                                                                                                                                                                                                                   | Predicate / source                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Exclusion filter          | Drop refs whose id is in `effectivelyExcludedSkillIds(config.skills)`.                                                                                                                                                                 | `effectivelyExcludedSkillIds` (`scope-predicates.ts`) |
| D7 cross-scope safety net | A `scope === "global"` agent only keeps refs whose id is in `globalSkillIds` (`config.skills` active at `"global"`), so a global agent never carries a project-only skill. Project-scoped agents keep all non-excluded refs.           | `isActiveAt(s, "global")` (`scope-predicates.ts`)     |
| D-217 per-skill `source`  | Each surviving ref gets `source: sourceById.get(ref.id)` from a `Map<SkillId, string>` built off `config.skills`. Missing entries are intentional — user-authored local skills have no `SkillConfig` and legitimately carry no source. | `SkillReference.source` (`src/cli/types/skills.ts`)   |

The per-skill `source` lets the compiler choose, per skill, between plugin ref format (`${id}:${id}`) and a bare id (eject) — `"eject"` means the skill is ejected to `.claude/skills/`, any other value (a marketplace name) means plugin-installed.

### `buildAgentScopeMap(config)`

Thin wrapper returning `activeAgentScopeMap(config.agents)` (`scope-predicates.ts`) — a `Map<AgentName, SkillScope>` of active (non-excluded) agents to their scope. Passed to `compileAndWriteAgents` so the compiler resolves each agent's skills against the correct (project vs global) install path.
