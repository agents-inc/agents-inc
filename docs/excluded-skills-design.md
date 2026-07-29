> **HISTORICAL DESIGN NOTE** — This was a pre-implementation plan. The feature has shipped, and its central premise has since been **superseded (D-277, 2026-07-30)**.
>
> This document assumes a user can opt out of a globally installed skill or agent by **deselecting** it in a project wizard, producing an excluded tombstone. That is no longer how it works: a globally installed item is **immutable from project scope** — the deselect is refused with a toast, and no removal path mints a tombstone. To keep a global skill out of a project, leave it out of the project's agent `stack`; to own a project copy, use the `s` scope toggle; to uninstall it, edit at global scope (`cd ~`).
>
> Excluded tombstones still exist, but only from two sources: the `s` scope toggle (G→P), which pairs the tombstone with an active project entry (`[P][G]`), and system-derived conflict masks written by the installer. Read the sections below as design history, not as behaviour.
>
> Current authoritative documentation: `.ai-docs/reference/concepts/tombstone-pattern.md`, `.ai-docs/reference/concepts/guard-pattern.md`, and `docs/guides/editing-config.md`.

# Excluded Skills & Agents Design Document

## Problem Statement

When a user installs skills globally (e.g., React via `cc init` from `~/`), those skills are available to all projects. However, there is no mechanism to **opt out** of a global skill at the project level.

This creates concrete problems:

1. **Exclusive categories break**: React is global, user wants Angular for a project. They're in the same exclusive `web-framework` category. Currently `lockedSkillIds` prevents deselecting React, so Angular cannot be selected at all.
2. **Deselection is meaningless**: Even if the user could deselect React in the project wizard, it has no effect — the skill still exists globally, still compiles into global agents, and reappears as selected on next wizard entry.
3. **No per-project customization**: The only way to avoid a global skill is to remove it from global config, which affects all projects.

---

## Design: `excluded?: boolean` on `SkillConfig` and `AgentScopeConfig`

### Type changes

```typescript
// src/cli/types/config.ts

// Before
type SkillConfig = { id: SkillId; scope: "project" | "global"; source: string };
type AgentScopeConfig = { name: AgentName; scope: "project" | "global" };

// After
type SkillConfig = { id: SkillId; scope: "project" | "global"; source: string; excluded?: boolean };
type AgentScopeConfig = { name: AgentName; scope: "project" | "global"; excluded?: boolean };
```

### Why a boolean on the config entry (not a separate array)

A separate `excludedSkills: SkillId[]` creates a type problem: excluded skills still need valid `SkillId` types to exist in the config. With `excluded?: boolean`:

- The entry is a valid typed object — no type gymnastics
- Config-types.ts doesn't change — the `SkillId` union includes all skills
- No separate array to keep in sync
- The `excluded` flag is self-describing on each entry

### Operations that produce excluded entries

| Operation          | What it means                                          | Config result                                                                                                                |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Exclusion**      | "I don't want this global skill/agent in my project"   | `{ id: "react-...", scope: "global", excluded: true }`                                                                       |
| **Scope override** | "I want this skill but at project scope (my own copy)" | TWO entries: `{ id: "react-...", scope: "global", excluded: true }` + `{ id: "react-...", scope: "project", source: "..." }` |

When a user toggles a global skill to project scope, the config gets **two entries** for that skill ID:

1. The excluded global entry — documents that the global version is masked
2. The active project entry — the version used by this project

This is intentional: the config should be transparent about what exists globally and what's been overridden. Without the excluded entry, it's unclear from the config alone that a global version exists but is masked.

### Scope toggle guard: eject conflicts

See `docs/excluded-skills-edge-cases.md` for the full scenario matrix. The key rule:

**Disabled:** Toggling a project-scoped ejected skill to global scope when a global ejected version already exists. The S hotkey does nothing and shows a toast: "Already exists as ejected skill at global scope. Remove it there first."

All other scope toggle combinations are safe. Agent scope toggles are always safe (agents are compiled, not files on disk).

### Config rendering

```typescript
const skills: SkillConfig[] = [
  // Global skills (from ~/.claude-src/config.ts)
  { id: "web-styling-tailwind-...", scope: "global", source: "agents-inc" },

  // Global skills (excluded)
  { id: "web-framework-react-...", scope: "global", source: "agents-inc", excluded: true },

  // Project skills
  { id: "web-framework-angular-...", scope: "project", source: "agents-inc" },
];

const agents: AgentScopeConfig[] = [
  // Global agents (from ~/.claude-src/config.ts)
  { name: "web-researcher", scope: "global" },

  // Global agents (excluded)
  { name: "web-reviewer", scope: "global", excluded: true },

  // Project agents
  { name: "api-developer", scope: "project" },
];
```

---

## Core principle: filter excluded early, once

The config on disk contains excluded entries for transparency. But **all runtime code works on pre-filtered arrays**. The filtering happens once, as early as possible — typically in the command or operation entry point immediately after loading config.

```
Config loaded from disk (has excluded entries for transparency)
    ↓
Filter once at the entry point:
  activeSkills = config.skills.filter(s => !s.excluded)
  activeAgents = config.agents.filter(a => !a.excluded)
    ↓
All downstream code receives clean arrays
(compilation, doctor, list, uninstall, .find(), .map() — all clean)
```

**Places that see the raw unfiltered config (by design):**

1. **Config rendering** (`generateConfigSource`, `splitConfigByScope`) — needs excluded entries for comment grouping and partition routing
2. **Wizard state restoration** (`populateFromSkillIds`, `handleComplete`) — needs to know which skills were excluded so they appear deselected in the grid
3. **`buildCompileAgents()`** — receives raw `ProjectConfig` and filters internally as its first step (it's the entry point to the compilation pipeline)
4. **`config-types-writer.ts:293`** — reads `config.skills.map(s => s.id)` for narrowing the `SkillId` union. Excluded skills should remain in this set (they are valid IDs that must be representable in the type system), so no filtering needed here.

**Places that need early filtering at their entry points:** 5. **`compile-agents.ts:44-46`** — Operations layer reads `config.agents` to filter by scope for `cc compile`. Without filtering, excluded agents leak into compilation. 6. **`agent-recompiler.ts:68-69`** — `resolveAgentNames()` reads `config.agents` independently. Without filtering, excluded agents would be compiled. 7. **`doctor.ts:125-163` (`checkAgentsCompiled`)** — reads `config.agents`. Without filtering, excluded agents trigger false "needs recompilation" warnings. 8. **`doctor.ts:165-182` (`checkNoOrphans`)** — reads `config.agents`. Without filtering, excluded agents prevent orphan detection from working correctly. 9. **`init.tsx:524`** — `deriveInstallMode` on `config.skills` with excluded entries could return the wrong mode.

**Places that need special handling for dual entries (excluded + active for the same skill ID):** 10. **`edit.tsx:312`** — `detectMigrations(oldSkills, result.skills)` — dual entries produce incorrect migration results. 11. **`edit.tsx:355`** — `result.skills.find()` in `applyScopeChanges()` — `.find()` returns the first match, which could be the excluded entry instead of the active one. 12. **`edit.tsx:391`** — `context.projectConfig?.skills?.find()` in `applyRemovedSkills()` — same `.find()` first-match issue. 13. **`edit.tsx:409`** — `result.skills.filter()` for added skills — excluded entries incorrectly included as additions. 14. **`edit.tsx:431`** — `config.skills` passed to `uninstallPluginSkills` — excluded entries cause attempted uninstallation of skills that should remain. 15. **`edit.tsx:562-598`** — `detectConfigChanges` uses `indexBy` — same duplicate-key problem as `mergeConfigs` in config-merger.ts.

**Recommendation for edit.tsx:** Filter excluded entries from `wizardResult.skills` BEFORE passing to `detectConfigChanges`, `applyScopeChanges`, and `applyRemovedSkills`. Excluded entries should only flow through to config generation (where both entries are preserved).

Everything else — list, uninstall, init installation, `.find()`, `.map()` — operates on pre-filtered arrays. Commands and operations filter once at their entry point after loading config.

---

## `lockedSkillIds` / `lockedAgentNames` removal

The locked mechanism was designed to make global items immutable in project context. With `excluded`, this entire concept is replaced — global skills and agents become freely toggleable in both init and edit flows.

### Current guards (all removed)

| Guard                          | File:Line           | Effect                                                          |
| ------------------------------ | ------------------- | --------------------------------------------------------------- |
| `toggleTechnology`             | wizard-store.ts:748 | No-op if skill is locked                                        |
| `toggleTechnology` (exclusive) | wizard-store.ts:757 | Rejects selecting new skill if it would deselect a locked skill |
| `toggleSkillScope`             | wizard-store.ts:849 | No-op if skill is locked                                        |
| `toggleFilterIncompatible`     | wizard-store.ts:827 | Preserves locked skills when filtering                          |
| `toggleAgent`                  | wizard-store.ts:921 | No-op if agent is locked                                        |
| `toggleAgentScope`             | wizard-store.ts:940 | No-op if agent is locked                                        |

### Files affected by removal

| File                                                                                   | What to remove                                              |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/cli/commands/edit.tsx:200-205,215,217`                                            | Stop computing/passing `lockedSkillIds`, `lockedAgentNames` |
| `src/cli/stores/wizard-store.ts` (state: 227,530,562; guards: 748,757,827,849,921,940) | Remove state fields + all toggle guards                     |
| `src/cli/components/hooks/use-wizard-initialization.ts:14,30,74-79`                    | Remove params and store setup                               |
| `src/cli/components/hooks/use-framework-filtering.ts:14,24,35,44`                      | Remove `lockedSkillIds` parameter                           |
| `src/cli/components/wizard/wizard.tsx:56,74,90`                                        | Remove props                                                |
| `src/cli/components/wizard/step-build.tsx:45,75`                                       | Remove `lockedSkillIds` usage                               |
| `src/cli/components/wizard/step-agents.tsx:169,221,224,275`                            | Remove locked agent checks and toast messages               |
| `src/cli/lib/wizard/build-step-logic.ts:55,91`                                         | Remove `lockedSkillIds` param, remove `locked` field        |

---

## Compilation pipeline

### Single compilation path via `buildCompileAgents()`

**File:** `src/cli/lib/installation/local-installer.ts:309-334`

This is the **single shared function** for building agent→skill mappings. After Phase 2 consolidation, `buildCompileConfig()` in `agent-recompiler.ts` is removed and all compilation paths go through `buildCompileAgents()`.

Because this function receives a `ProjectConfig` object (not pre-filtered arrays), it filters excluded entries internally as its first step:

```typescript
export function buildCompileAgents(
  config: ProjectConfig,
  agents: Record<AgentName, AgentDefinition>,
): Record<string, CompileAgentConfig> {
  // Filter excluded entries first — all logic below works on clean data
  const activeSkills = config.skills.filter((s) => !s.excluded);
  const activeAgents = config.agents.filter((a) => !a.excluded);

  // D7 cross-scope safety: global agents only see global skills
  const globalSkillIds = new Set(activeSkills.filter((s) => s.scope === "global").map((s) => s.id));
  const activeSkillIds = new Set(activeSkills.map((s) => s.id));

  const compileAgents: Record<string, CompileAgentConfig> = {};
  for (const agentConfig of activeAgents) {
    if (agents[agentConfig.name]) {
      const agentStack = config.stack?.[agentConfig.name];
      if (agentStack) {
        const refs = buildSkillRefsFromConfig(agentStack);
        const filteredRefs = refs.filter(
          (ref) =>
            activeSkillIds.has(ref.id) &&
            (agentConfig.scope !== "global" || globalSkillIds.has(ref.id)),
        );
        compileAgents[agentConfig.name] = { skills: filteredRefs };
      } else {
        compileAgents[agentConfig.name] = {};
      }
    }
  }
  return compileAgents;
}
```

### Downstream — no changes needed

| Function                     | File                            | Why                                               |
| ---------------------------- | ------------------------------- | ------------------------------------------------- |
| `resolveAgents()`            | resolver.ts:153-199             | Missing skills already skip gracefully            |
| `compileAgentForPlugin()`    | stack-plugin-compiler.ts:72-136 | Operates on pre-filtered data                     |
| `buildSkillRefsFromConfig()` | resolver.ts:65-67               | Just extracts refs; filtering in caller           |
| `compileAndWriteAgents()`    | local-installer.ts:481-523      | Only processes agents from `buildCompileAgents()` |

### `discoverInstalledSkills()` — NO changes

**File:** `src/cli/lib/operations/skills/discover-skills.ts:112-159`

Pure discovery function. Filtering happens at call sites.

---

## Config generation pipeline

### `splitConfigByScope()`

**File:** `src/cli/lib/configuration/config-generator.ts:169-247`

This is a **config rendering** function — it decides where to write entries in config.ts. It sees ALL entries including excluded. Excluded global entries go to the **project partition** (they're project-level overrides). The global config never sees `excluded: true` entries.

```typescript
// Skills: excluded global entries → project partition
const globalSkills = config.skills.filter((s) => s.scope === "global" && !s.excluded);
const projectSkills = config.skills.filter(
  (s) => s.scope === "project" || (s.scope === "global" && s.excluded),
);

// Agents: same pattern
const globalAgents = config.agents.filter((a) => a.scope === "global" && !a.excluded);
const projectAgents = config.agents.filter(
  (a) => a.scope === "project" || (a.scope === "global" && a.excluded),
);
```

### `mergeGlobalConfigs()`

**File:** `local-installer.ts:348-385`

When merging incoming config into global, excluded entries must NOT leak into global config:

```typescript
const incomingActiveSkills = incoming.skills.filter((s) => !s.excluded);
const mergedSkills = [
  ...existing.skills,
  ...incomingActiveSkills.filter((s) => !existingSkillIds.has(s.id)),
];
```

### `mergeConfigs()`

**File:** `src/cli/lib/configuration/config-merger.ts:25-86`

The `mergeConfigs()` function (the synchronous merge logic; `mergeWithExistingConfig()` is the async wrapper starting at line 89) uses `indexBy(merged.skills, s => s.id)` at line 56 to build a lookup. With dual entries for the same ID (excluded global + active project), `indexBy` keeps only the LAST entry — one is lost.

**Solution:** Change `indexBy` in `mergeConfigs` to use a compound key (`${id}:${scope}`) or handle excluded entries separately. The same `indexBy` problem exists in `detectConfigChanges` at `edit.tsx:562-598` — both need the compound key fix.

The wizard result's `skills` array also flows through `buildEjectConfig()` → `generateProjectConfigFromSkills()`. At `local-installer.ts:162`, `wizardResult.skills.map(s => s.id)` produces duplicate skill IDs when both excluded and active entries exist for the same ID. These duplicates flow into stack building at `config-generator.ts:98-103` creating redundant entries. **Fix:** Deduplicate `skillIds` (use `unique()` from Remeda) before passing to `generateProjectConfigFromSkills`.

### `generateConfigSource()`

**File:** `src/cli/lib/configuration/config-writer.ts:35-277`

Needs rendering changes in all 3 modes to group skills/agents into comment sections (active global, excluded global, project). The `excluded: true` field serializes naturally as part of JSON.

### `generateConfigTypesSource()`

**File:** `src/cli/lib/configuration/config-types-writer.ts:268-379`

Add `excluded?: boolean` to the `SkillConfig` and `AgentScopeConfig` interfaces in generated types. The `SkillId` and `AgentName` unions do NOT change.

The template change point for the interface definitions is `PROJECT_CONFIG_TYPES_BEFORE` at `config-types-writer.ts:53-67` — this is where the `SkillConfig` and `AgentScopeConfig` interfaces are defined as template strings.

### Zod schema

**File:** `src/cli/lib/schemas.ts:~270`

Add `excluded: z.boolean().optional()` to skill config object within `projectConfigLoaderSchema`. Same for agent config object.

### JSON schema

**File:** `src/schemas/project-config.schema.json`

Add `excluded` boolean property to both skill and agent config items.

**Note:** The current schema defines `skills` and `agents` as arrays of strings, not arrays of objects. Adding `excluded` there may not apply in its current form. This is a pre-existing schema mismatch (see "Known pre-existing issues" section). The schema may need to be updated to match the runtime `ProjectConfig` type as a separate cleanup.

---

## Commands

### `cc doctor`

**File:** `src/cli/commands/doctor.ts`

**`checkSkillsResolved()` (lines 81-123):** Computes skills from `config.stack` via `getStackSkillIds()`. Filter excluded skills from config before validation — otherwise false "missing skill" warnings.

**`checkSkillsInstalled()` (lines 206-244):** Validates eject-mode skills on disk. Filter `excluded: true` entries before checking — excluded skills shouldn't be validated as installed.

### `cc list`

**File:** `src/cli/commands/list.tsx:99`

Passes `config.skills` to `SkillAgentSummary`. Filter excluded entries before passing to component, or show with "(excluded)" indicator. `SkillAgentSummary` at `skill-agent-summary.tsx:44-47` currently filters by scope only — would need a third group or filtering.

### `cc compile`

After Phase 2 consolidation, goes through `buildCompileAgents()` which handles filtering internally. No command-level changes needed.

### `cc uninstall`

Filter excluded entries before processing. Only uninstall active entries. Leave excluded entries in config (they're project-level overrides of global).

### `cc import`

When importing a skill that conflicts with an excluded global skill, should warn if a global excluded version exists.

---

## Wizard changes

### `toggleTechnology` for global skills

When a global skill is deselected in the project wizard, instead of removing it from `skillConfigs`, keep it with `excluded: true`:

```typescript
// In toggleTechnology, when deselecting:
const deselectedConfig = state.skillConfigs.find((sc) => sc.id === id);
if (deselectedConfig?.scope === "global") {
  // Mark as excluded instead of removing
  updatedConfigs = state.skillConfigs.map((sc) => (sc.id === id ? { ...sc, excluded: true } : sc));
} else {
  // Project skill — remove normally
  updatedConfigs = state.skillConfigs.filter((sc) => sc.id !== id);
}
```

Re-selecting a global skill clears the `excluded` flag.

### Exclusive category auto-deselection

The design above covers direct deselection in `toggleTechnology`, but there is also an auto-deselection case. When selecting Angular in the `web-framework` exclusive category, React is auto-deselected via the `removed` set at `wizard-store.ts:803`:

```typescript
skillConfigs.filter((sc) => !removed.has(sc.id));
```

This filter removes global React entirely instead of marking it `excluded: true`. The fix applies to the same filter — global skills in the `removed` set should be marked excluded, not filtered out:

```typescript
skillConfigs
  .filter((sc) => !removed.has(sc.id) || sc.scope === "global")
  .map((sc) => (removed.has(sc.id) && sc.scope === "global" ? { ...sc, excluded: true } : sc));
```

### `toggleAgent` for global agents

Same pattern — deselecting a global agent marks it `excluded: true` instead of removing from `agentConfigs`.

### `findIncompatibleWebSkills()`

**File:** `wizard-store.ts:57-77`

Currently uses `lockedSkillIds` to skip locked skills. After removal, skip excluded skills instead — they're already excluded from the project, so they shouldn't affect compatibility filtering.

### `preselectAgentsFromDomains()`

**File:** `wizard-store.ts:952-966`

Currently replaces `selectedAgents` and `agentConfigs` entirely, wiping any excluded agents. Must merge with existing configs instead:

```typescript
const existing = new Map(state.agentConfigs.map((ac) => [ac.name, ac]));
const merged = sorted.map((name) => existing.get(name) ?? { name, scope: "global" });
return { selectedAgents: sorted, agentConfigs: merged };
```

### `WizardResultV2`

**File:** `src/cli/components/wizard/wizard.tsx:30-43`

No new field needed. The `skills: SkillConfig[]` array carries `excluded: true` entries naturally. Same for `agentConfigs: AgentScopeConfig[]`.

### `handleComplete()` in wizard.tsx

**File:** `src/cli/components/wizard/wizard.tsx:166-200`

`getAllSelectedTechnologies()` only returns skills from `domainSelections` — excluded skills are not there (they're deselected). Must explicitly append excluded entries from `skillConfigs` to the result.

### `populateFromSkillIds` for edit re-entry

**File:** `wizard-store.ts:644-690`

When loading existing config for edit:

1. Pass only active skill IDs (non-excluded) for `domainSelections` — excluded skills appear deselected in the grid
2. Find the active (non-excluded) entry when building each `skillConfig` — `.find()` should skip excluded entries for the same ID
3. Preserve excluded entries in `skillConfigs` so they flow through to wizard result

### `cc edit` re-entry

**File:** `src/cli/commands/edit.tsx:190-239`

- Remove `lockedSkillIds`/`lockedAgentNames` computation (lines 200-205)
- `installedSkillConfigs` includes all entries (including `excluded: true`)
- User can re-select (clears `excluded`) or leave excluded

### Stack selection with excluded skills

**File:** `wizard-store.ts:597-690` and `stack-selection.tsx:200-204`

When a stack includes React but React is excluded from global config:

- `populateFromSkillIds` preserves the `excluded` flag from saved configs
- Selecting a stack does NOT override explicit exclusions — the excluded flag persists

### `handleInstallation()` in init.tsx

**File:** `init.tsx:283-340`

Filter excluded entries before passing to copy/install functions:

```typescript
const activeSkills = result.skills.filter((s) => !s.excluded);
const ejectedSkills = activeSkills.filter((s) => s.source === "eject");
const pluginSkills = activeSkills.filter((s) => s.source !== "eject");
```

### Agent files on disk — no masking needed

When a global agent is excluded at project level:

- The agent.md still exists at `~/.claude/agents/` (unchanged — serves other projects)
- It is NOT compiled to `<project>/.claude/agents/` (because `buildCompileAgents()` skips it)
- No stub/masking file needed — absence from project agents dir is sufficient

### Source-switcher interaction

**File:** `src/cli/lib/skills/source-switcher.ts:65-103`

`migrateLocalSkillScope()` moves skills between project and global locations. Must not migrate excluded skills — the check should happen in the caller before calling migrate.

---

## Implementation phases

### Phase 1: Type + schema

1. Add `excluded?: boolean` to `SkillConfig` and `AgentScopeConfig` in `src/cli/types/config.ts`
2. Add `excluded: z.boolean().optional()` to Zod schema in `src/cli/lib/schemas.ts`
3. Add `excluded` property to JSON schema in `src/schemas/project-config.schema.json` (may require updating the schema to use object arrays — see "Known pre-existing issues")
4. Add `excluded?: boolean` to generated config-types in `config-types-writer.ts` (template at `PROJECT_CONFIG_TYPES_BEFORE`, lines 53-67)
5. Run all tests — nothing should change (field is optional, defaults to undefined/falsy)

### Phase 2: Config generation + compilation pipeline

**Includes compilation path consolidation (previously Phase 0).**

1. **Consolidate `buildCompileConfig()`**: Remove from `agent-recompiler.ts` and have `cc compile` use `buildCompileAgents()` from `local-installer.ts` instead. This gives one shared compilation path with D7 cross-scope safety filtering — and one place to add excluded filtering.
   - Make `buildCompileAgents()` callable from `recompileAgents()` (may need to adjust params or extract shared logic)
   - Remove `buildCompileConfig()` from `agent-recompiler.ts`
   - Update `recompileAgents()` to use `buildCompileAgents()`, wrapping the result in `CompileConfig` with name/description
2. **`splitConfigByScope`**: Route excluded global entries to project partition
3. **`mergeGlobalConfigs`**: Filter excluded entries before merging into global config
4. **`generateConfigSource`**: Group excluded entries under "// Global skills (excluded)" / "// Global agents (excluded)" comment sections
5. **`buildCompileAgents`**: Add excluded filtering as first step (filter `config.skills` and `config.agents`)
6. **`compile-agents.ts:44-46`**: Add excluded filtering at entry point — operations layer reads `config.agents` for scope filtering
7. **`agent-recompiler.ts:68-69`**: After consolidation, `resolveAgentNames()` goes through `buildCompileAgents()` which handles filtering. Verify no independent config reads remain.
8. **`mergeConfigs`**: Fix `indexBy` to use compound key (`${id}:${scope}`) to handle dual entries
9. **`buildEjectConfig`** (`local-installer.ts:162`): Deduplicate `skillIds` with `unique()` before passing to `generateProjectConfigFromSkills`
10. Run all tests

### Phase 3: Wizard store + locked removal

1. Remove `lockedSkillIds`/`lockedAgentNames` from all files (see removal table above)
2. Update `toggleTechnology` to set `excluded: true` on global skills instead of removing
3. Update `toggleAgent` to set `excluded: true` on global agents instead of removing
4. **Fix exclusive category auto-deselection**: In `toggleTechnology`, the `removed` set filter at line 803 must mark global skills as `excluded: true` instead of removing them (see "Exclusive category auto-deselection" section above)
5. Update `findIncompatibleWebSkills` to skip excluded skills
6. Fix `preselectAgentsFromDomains` to merge with existing configs instead of replacing
7. Update `populateFromSkillIds` to skip excluded entries from `domainSelections` and find active entries
8. Update `handleComplete` to append excluded entries to wizard result
9. Add scope toggle guard for eject conflicts (see `excluded-skills-edge-cases.md`)
10. Run all tests

### Phase 4: Command + edit updates

1. **Edit command**: Pass excluded entries through to wizard (locked removal already done in phase 3)
2. **Edit command — dual entry handling**: Filter excluded entries from `wizardResult.skills` BEFORE passing to `detectConfigChanges`, `applyScopeChanges`, `applyRemovedSkills`, and `uninstallPluginSkills`. Specifically:
   - `edit.tsx:312` — `detectMigrations` receives only active entries
   - `edit.tsx:355` — `applyScopeChanges` `.find()` skips excluded entries
   - `edit.tsx:391` — `applyRemovedSkills` `.find()` skips excluded entries
   - `edit.tsx:409` — added skills filter excludes excluded entries
   - `edit.tsx:431` — `uninstallPluginSkills` receives only active entries
   - `edit.tsx:562-598` — `detectConfigChanges` `indexBy` uses compound key (same fix as `mergeConfigs`)
3. **Init command**: Filter excluded entries in `handleInstallation()` before copy/install. Also filter at `init.tsx:524` before `deriveInstallMode`.
4. **Doctor**: Filter excluded from `checkSkillsResolved` and `checkSkillsInstalled`. Also filter in:
   - `doctor.ts:125-163` (`checkAgentsCompiled`) — exclude excluded agents from recompilation checks
   - `doctor.ts:165-182` (`checkNoOrphans`) — exclude excluded agents from orphan detection
5. **List**: Filter or render excluded entries with indicator
6. **Uninstall**: Filter excluded entries before processing
7. **Compile**: Already handled via `buildCompileAgents()` consolidation in Phase 2
8. Run all tests

### Phase 5: Tests

1. Update all tests referencing `lockedSkillIds`/`lockedAgentNames`
2. Add unit tests for excluded filtering in `buildCompileAgents`, `splitConfigByScope`, `mergeGlobalConfigs`
3. Add unit tests for `mergeConfigs` and `detectConfigChanges` compound key handling with dual entries
4. Add wizard store tests for excluded toggle behavior (both direct deselection and exclusive category auto-deselection)
5. Add E2E tests for exclusion lifecycle (init with exclusions → edit → re-edit)

---

## Known pre-existing issues

These are not caused by the excluded skills feature but were discovered during analysis and affect the implementation:

1. **`project-config.schema.json` defines skills/agents as string arrays, not object arrays.** The runtime `ProjectConfig` type uses `SkillConfig[]` and `AgentScopeConfig[]` (objects with `id`, `scope`, `source`, etc.), but the JSON schema defines them as `string[]`. Adding `excluded` to the schema requires first updating the schema to match the runtime type. This is a separate cleanup task and does not block the feature (the JSON schema is not used for runtime validation — Zod schemas handle that).

2. **`buildCompileConfig()` in `agent-recompiler.ts` lacks D7 cross-scope safety filtering.** Unlike `buildCompileAgents()` in `local-installer.ts`, the recompiler's version does not enforce that global agents only see global skills. This is fixed by the consolidation step in Phase 2 (removing `buildCompileConfig()` entirely).
