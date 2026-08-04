# D-08: Support User-Defined Stacks in Consumer Projects

**Status:** Pending
**Research doc:** [docs/cli/research/user-defined-stacks.md](../../docs/cli/research/user-defined-stacks.md)
**Complexity:** Medium (~300-400 lines of new/modified code + tests)

## Implementation Overview

Replace the either/or stack loading (source stacks OR CLI stacks) with a 3-tier merge: project stacks (from consumer's `stacksFile` in config) at the top, marketplace stacks in the middle, public CLI stacks at the bottom. Add `StackOrigin` type (`"project" | "marketplace" | "public"`) and `origin`/`originLabel` fields to `ResolvedStack`. Public stacks are hidden when a private marketplace source is configured. The stack selection UI groups stacks by origin with section headers when 2+ origins are present; flat list preserved for single-origin. About 6 files changed: types (~3 lines), `source-loader.ts` (~60 lines modified), `stack-selection.tsx` (~50 lines modified), plus tests.

---

## Current State Analysis

### How Stacks Load Today

The stack loading pipeline has three layers:

**1. Raw Loading: `stacks-loader.ts:52-92` (`loadStacks()`)**

- Takes `configDir` (base path) + optional `stacksFile` (defaults to `STACKS_FILE_PATH` = `"config/stacks.yaml"` from `consts.ts:27`)
- Parses YAML against `stacksConfigSchema` (Zod, `schemas.ts:695-697`)
- Normalizes agent configs via `normalizeAgentConfig()` (bare strings to `SkillAssignment[]`)
- Caches by `${configDir}:${resolvedStacksFile}`
- Returns `Stack[]` (the raw YAML model from `types/stacks.ts:9-16`)

**2. Source Integration: `source-loader.ts:171-250` (`loadAndMergeFromBasePath()`)**

This is the critical function. At lines 226-233:

```typescript
const sourceStacks = await loadStacks(basePath, stacksRelFile)
const stacks =
  sourceStacks.length > 0 ? sourceStacks : await loadStacks(PROJECT_ROOT)
if (stacks.length > 0) {
  mergedMatrix.suggestedStacks = stacks.map((stack) =>
    convertStackToResolvedStack(stack)
  )
}
```

**This is an either/or choice.** If the source (marketplace) has a `stacks.yaml`, those stacks replace the CLI's built-in stacks entirely. If the source has no stacks, the CLI's built-in `config/stacks.yaml` is used. There is no merging from multiple origins.

The `stacksRelFile` comes from the **source's** `.claude-src/config.yaml` at line 176:

```typescript
const stacksRelFile = sourceProjectConfig?.stacksFile
```

**3. Resolution: `source-loader.ts:253-296` (`convertStackToResolvedStack()`)**

Converts `Stack` to `ResolvedStack` (the wizard's read model from `types/matrix.ts:267-276`). Resolves agent configs to flat skill ID lists. No origin tracking exists.

### Where Stacks Are Consumed

| Consumer           | File:Line                | Usage                                                      |
| ------------------ | ------------------------ | ---------------------------------------------------------- |
| Stack selection UI | `stack-selection.tsx:27` | `matrix.suggestedStacks` -- flat list, no grouping         |
| Stack skill lookup | `wizard.tsx:160`         | `matrix.suggestedStacks.find(s => s.id === stackId)`       |
| Agent discovery    | `step-agents.tsx:117`    | Iterates `matrix.suggestedStacks` for agent names          |
| Stack name display | `utils.ts:25`            | `matrix.suggestedStacks.find(s => s.id === stackId)?.name` |

### Current Type Definitions

**`Stack`** (`types/stacks.ts:9-16`) -- Raw YAML model:

```typescript
type Stack = { id; name; description; agents; philosophy? }
```

**`ResolvedStack`** (`types/matrix.ts:267-276`) -- Wizard read model:

```typescript
type ResolvedStack = { id; name; description; skills; allSkillIds; philosophy }
```

Neither type has origin tracking. No `StackOrigin` type exists.

### Config Support

`ProjectSourceConfig` (`config.ts:38-51`) already has `stacksFile?: string` at line 49. This field currently tells a **source** where its own stacks file lives (relative to the source root). It is read from the source's `.claude-src/config.yaml` in `loadAndMergeFromBasePath()` at line 176.

The consumer project's `.claude-src/config.yaml` also supports this field (same schema), but nothing currently reads it from the consumer's config for project-level stacks.

---

## Design: 3-Tier Stack Hierarchy

The TODO spec calls for 4 tiers (project > global > marketplace > public). However, **global stacks depend on D-36 (global install support)**, which does not exist yet. There is no `~/.config/agents-inc/` directory concept, no global config resolution, and no `GLOBAL_CONFIG` constant anywhere in the codebase. Implementing a global tier now would require inventing infrastructure that D-36 will define.

**Decision: Implement 3 tiers now, add global tier when D-36 lands.**

### Tier Hierarchy (top to bottom)

| Priority   | Origin          | Source                                                       | Display Label                  |
| ---------- | --------------- | ------------------------------------------------------------ | ------------------------------ |
| 1 (top)    | `"project"`     | Consumer's `stacks_file` from `.claude-src/config.yaml`      | "Your Project"                 |
| 2          | `"marketplace"` | Primary source's `config/stacks.yaml` or custom `stacksFile` | Marketplace name or source org |
| 3 (bottom) | `"public"`      | CLI's built-in `config/stacks.yaml`                          | "Agents Inc"                   |

### Visibility Rules

- **Public stacks are hidden when a private marketplace source is configured.** Private = `sourceConfig.source !== DEFAULT_SOURCE`. This prevents duplicate/confusing stacks when the marketplace already curates its own.
- **Project stacks always show** regardless of marketplace configuration.
- **Empty tiers produce no section header** (if a tier has 0 stacks, it is omitted silently).

### Merge Rules (No Deduplication)

Stacks from different origins are **not deduplicated**. If a project stack has `id: "nextjs-fullstack"` and the public stacks also have one, both appear in their respective sections. The user sees both and chooses.

Rationale: Stack IDs are opaque strings chosen by authors. Cross-origin collision is unlikely and harmless when it occurs -- the section header disambiguates.

---

## New Types

### `StackOrigin` (add to `types/stacks.ts`)

```typescript
export type StackOrigin = "project" | "marketplace" | "public"
```

This is a small, finite, known set (<30 values) -- fits the union type pattern per CLAUDE.md decision tree.

### Extend `ResolvedStack` (modify `types/matrix.ts:267-276`)

Add two optional fields:

```typescript
export type ResolvedStack = {
  // ... existing fields unchanged ...
  origin?: StackOrigin
  originLabel?: string
}
```

Both are optional. Stacks without origin default to `"public"` behavior. The `originLabel` is a human-readable display string for the section header.

### Do NOT Extend `Stack` or Zod Schemas

The `origin` and `originLabel` are **not part of the YAML format**. They are assigned programmatically by the loader based on where the file was loaded from. The `stackSchema` (`schemas.ts:683-691`) and `stacksConfigSchema` (`schemas.ts:695-697`) stay unchanged.

### Do NOT Extend `stacksConfigSchema` min(1) Requirement

The existing `z.array(stackSchema).min(1)` at `schemas.ts:696` requires at least 1 stack. This is appropriate -- an empty stacks file is a user error. If the file doesn't exist, `loadStacks()` already returns `[]` gracefully (line 60-63 of `stacks-loader.ts`).

---

## Loader Changes

### 1. Modify `loadAndMergeFromBasePath()` (`source-loader.ts:171-250`)

**Current behavior (lines 226-233):** Either source stacks or CLI stacks, not both.

**New behavior:** Always load both, tag each with origin, return combined list.

The function needs access to `marketplace` name for the origin label. Currently it doesn't have this. Two options:

- **Option A:** Pass `marketplace` as a parameter to `loadAndMergeFromBasePath()`
- **Option B:** Move the origin-tagging to the caller (`loadFromLocal`/`loadFromRemote`)

**Recommended: Option A.** Add an optional parameter to `loadAndMergeFromBasePath()`:

```typescript
async function loadAndMergeFromBasePath(
  basePath: string,
  marketplaceLabel?: string // NEW
): Promise<MergedSkillsMatrix>
```

The callers (`loadFromLocal` at line 123, `loadFromRemote` at line 145) already have access to the marketplace name from `sourceConfig.marketplace`.

**Specific changes to lines 226-233:**

Replace:

```typescript
const sourceStacks = await loadStacks(basePath, stacksRelFile)
const stacks =
  sourceStacks.length > 0 ? sourceStacks : await loadStacks(PROJECT_ROOT)
if (stacks.length > 0) {
  mergedMatrix.suggestedStacks = stacks.map((stack) =>
    convertStackToResolvedStack(stack)
  )
  const stackSource = sourceStacks.length > 0 ? "source" : "CLI"
  verbose(`Loaded ${stacks.length} stacks from ${stackSource}`)
}
```

With:

```typescript
const sourceStacks = await loadStacks(basePath, stacksRelFile)
const cliStacks = await loadStacks(PROJECT_ROOT)

const allStacks: ResolvedStack[] = []

if (sourceStacks.length > 0) {
  const label = marketplaceLabel ?? "Marketplace"
  allStacks.push(
    ...sourceStacks.map((s) => ({
      ...convertStackToResolvedStack(s),
      origin: "marketplace" as StackOrigin,
      originLabel: label,
    }))
  )
  verbose(`Loaded ${sourceStacks.length} marketplace stacks from source`)
}

if (cliStacks.length > 0) {
  allStacks.push(
    ...cliStacks.map((s) => ({
      ...convertStackToResolvedStack(s),
      origin: "public" as StackOrigin,
      originLabel: DEFAULT_PUBLIC_SOURCE_NAME,
    }))
  )
  verbose(`Loaded ${cliStacks.length} public stacks from CLI`)
}

mergedMatrix.suggestedStacks = allStacks
```

Import `DEFAULT_PUBLIC_SOURCE_NAME` from `consts.ts:164` (already exists: `"Agents Inc"`).

### 2. Modify `loadSkillsMatrixFromSource()` (`source-loader.ts:67-107`)

After `loadAndMergeFromBasePath()` returns (around line 93-94), add project-level stack loading:

```typescript
// Load project-level stacks from consumer's config
const resolvedProjectDir = projectDir || process.cwd()
const consumerConfig = await loadProjectSourceConfig(resolvedProjectDir)
if (consumerConfig?.stacksFile) {
  const projectStacks = await loadStacks(
    resolvedProjectDir,
    consumerConfig.stacksFile
  )
  if (projectStacks.length > 0) {
    const taggedProjectStacks = projectStacks.map((s) => ({
      ...convertStackToResolvedStack(s),
      origin: "project" as StackOrigin,
      originLabel: "Your Project",
    }))
    // Prepend: project stacks go at the top of the list
    result.matrix.suggestedStacks = [
      ...taggedProjectStacks,
      ...result.matrix.suggestedStacks,
    ]
    verbose(
      `Loaded ${projectStacks.length} project stacks from ${consumerConfig.stacksFile}`
    )
  }
}
```

**Note:** `loadProjectSourceConfig()` is already called once in `loadAndMergeFromBasePath()` for the **source's** config (line 172). The second call here is for the **consumer project's** config. These are different directories. The `loadProjectSourceConfig` result is cached-friendly since it reads a different path.

### 3. Apply Exclusion Rule

After all stacks are assembled, before returning the result:

```typescript
// Hide public stacks when a private marketplace source is configured
if (sourceConfig.source !== DEFAULT_SOURCE) {
  result.matrix.suggestedStacks = result.matrix.suggestedStacks.filter(
    (s) => s.origin !== "public"
  )
}
```

This goes in `loadSkillsMatrixFromSource()`, after project stacks are prepended.

Import `DEFAULT_SOURCE` (already available from `../configuration`).

### 4. Thread `marketplace` Through to `loadAndMergeFromBasePath()`

`loadFromLocal()` (`source-loader.ts:109-132`):

```typescript
const mergedMatrix = await loadAndMergeFromBasePath(
  skillsPath,
  sourceConfig.marketplace
)
```

`loadFromRemote()` (`source-loader.ts:134-169`):

```typescript
const mergedMatrix = await loadAndMergeFromBasePath(
  fetchResult.path,
  marketplace
)
```

---

## Wizard UI Changes

### `stack-selection.tsx` -- Group Stacks by Origin

**Current behavior:** Flat list of all stacks + "Start from scratch" at bottom.

**New behavior:** Stacks grouped by origin with section headers. Non-selectable headers. "Start from scratch" remains at the bottom.

**Visual layout:**

```
Choose a stack

  Your Project
  > Custom Work Stack    Full-stack for internal tools
    Custom API Stack     Backend-only stack

  Acme Corp
    Acme Full Stack      Complete frontend + backend
    Acme Backend Stack   API-only configuration

  ────────────────────
  Start from scratch   Select domains and skills manually
```

When only public stacks exist (no project or marketplace), no section header is shown -- the current flat layout is preserved. Section headers only appear when stacks come from 2+ origins.

### Implementation Approach

**1. Grouping logic (pure function, can be tested independently):**

```typescript
type StackSection = {
  label: string
  origin: StackOrigin
  stacks: ResolvedStack[]
}

const ORIGIN_ORDER: StackOrigin[] = ["project", "marketplace", "public"]

function groupStacksByOrigin(stacks: ResolvedStack[]): StackSection[] {
  // ... group by origin, sort by ORIGIN_ORDER, return sections
}
```

**2. Flat navigation index:**

Section headers are non-selectable. Only stacks and "Start from scratch" get indices. The `focusedIndex` still maps to a flat count of selectable items.

```
Index 0: Custom Work Stack (project)
Index 1: Custom API Stack (project)
Index 2: Acme Full Stack (marketplace)
Index 3: Acme Backend Stack (marketplace)
Index 4: Start from scratch
```

Headers are rendered but not part of the index.

**3. Single-origin optimization:**

When all stacks have the same origin (or no origin), skip the grouping and render the flat list as today. This preserves the existing UX for the common case.

**4. Section header rendering:**

Use a `<Text dimColor bold>` for section labels, with `marginTop={1}` between sections. Match the dim styling used elsewhere in the wizard.

---

## Step-by-Step Implementation Plan

### Phase 1: Types (2 files, ~10 lines)

1. **`src/cli/types/stacks.ts`** -- Add `StackOrigin` type:

   ```typescript
   export type StackOrigin = "project" | "marketplace" | "public"
   ```

2. **`src/cli/types/matrix.ts`** -- Add `origin?` and `originLabel?` to `ResolvedStack` (lines 267-276):

   ```typescript
   origin?: StackOrigin;
   originLabel?: string;
   ```

   (`types/index.ts` already re-exports everything from `stacks.ts` via `export type * from "./stacks"` at line 5, so `StackOrigin` is automatically exported.)

### Phase 2: Loader Changes (1 file, ~50-60 lines modified)

3. **`src/cli/lib/loading/source-loader.ts`** -- Main changes:
   - Add `marketplaceLabel?: string` parameter to `loadAndMergeFromBasePath()`
   - Replace either/or stacks logic with multi-origin merge (lines 226-233)
   - Thread `marketplace` from `loadFromLocal()` and `loadFromRemote()` into the new parameter
   - Add project stacks loading in `loadSkillsMatrixFromSource()` (after line ~93)
   - Add exclusion rule (filter out `origin: "public"` when private source configured)
   - Import `StackOrigin` from types, `DEFAULT_PUBLIC_SOURCE_NAME` from consts

### Phase 3: UI Changes (1 file, ~40-60 lines modified)

4. **`src/cli/components/wizard/stack-selection.tsx`** -- Group and render:
   - Add `groupStacksByOrigin()` function
   - Modify render to show section headers when 2+ origins present
   - Update keyboard navigation indices (selectable items only, headers excluded)
   - Keep "Start from scratch" at the bottom outside any section

### Phase 4: Test Helpers (1 file, ~5 lines)

5. **`src/cli/lib/__tests__/helpers.ts`** -- Update `createMockResolvedStack()`:
   - No changes needed to the factory itself -- it already accepts `Partial<ResolvedStack>` via `overrides`, so callers can pass `{ origin: "project", originLabel: "Your Project" }`.
   - May want to add convenience factories for common patterns.

### Phase 5: Tests (~100-150 lines across 2-3 files)

6. **`src/cli/lib/loading/source-loader.test.ts`** -- Loader tests:
   - Test that source stacks get `origin: "marketplace"` and `originLabel`
   - Test that CLI stacks get `origin: "public"` and `originLabel: "Agents Inc"`
   - Test that project stacks from `stacksFile` get `origin: "project"` and `originLabel: "Your Project"`
   - Test ordering: project stacks first, then marketplace, then public
   - Test exclusion rule: public stacks hidden when private source configured
   - Test exclusion rule does NOT apply when using default source
   - Test that missing project `stacksFile` produces no project section
   - Modify existing "either/or" tests (`source-loader.test.ts:555-602`) that assert exact stack counts -- they will now see combined counts

7. **`src/cli/components/wizard/step-stack.test.tsx`** -- UI tests:
   - Test section headers appear when stacks have 2+ origins
   - Test no section headers when all stacks share one origin (backward compat)
   - Test keyboard navigation skips section headers
   - Test "Start from scratch" remains reachable at bottom
   - Existing tests should continue to pass (stacks without origin default to public, single-origin renders flat)

---

## Edge Cases

### Duplicate Stack IDs Across Origins

**Scenario:** Project has `id: "nextjs-fullstack"`, public stacks also have one.

**Handling:** Both appear in their respective sections. Section headers disambiguate. The `selectedStackId` in the wizard store is just a string; `matrix.suggestedStacks.find(s => s.id === stackId)` returns the first match, which is the project stack (it's prepended). This is the correct priority order.

**Risk:** If a user selects a marketplace stack and later adds a project stack with the same ID, the store's `selectedStackId` would now resolve to the project stack. This is acceptable -- project stacks should win.

### Consumer's `stacksFile` Points to Nonexistent File

**Handling:** `loadStacks()` returns `[]` when the file doesn't exist (line 60-63 of `stacks-loader.ts`). No error, no project section. Existing behavior is correct.

### Consumer's `stacksFile` Has Invalid YAML

**Handling:** `loadStacks()` throws with a clear error message (line 70-72). This propagates up and surfaces in the CLI. No special handling needed.

### Consumer Has No `.claude-src/config.yaml`

**Handling:** `loadProjectSourceConfig()` returns `null` (line 74-76 in `config.ts`). The `consumerConfig?.stacksFile` check short-circuits. No project stacks loaded.

### `stacksFile` Is an Absolute Path

**Handling:** `path.join(configDir, resolvedStacksFile)` in `loadStacks()` line 58. With an absolute `resolvedStacksFile`, `path.join` returns the absolute path (ignoring `configDir`). This works but could be surprising. Consider adding a validation warning if the path is absolute, but do NOT block it -- it's a valid use case for power users.

### Source Uses Same Source as Default (No Private)

**Handling:** When `sourceConfig.source === DEFAULT_SOURCE`, the exclusion rule does not apply. Public stacks show normally. If the source happens to also have stacks, they appear as "marketplace" stacks alongside "public" stacks. In practice, the default source IS the public source, so `loadStacks(basePath, ...)` and `loadStacks(PROJECT_ROOT)` would return the same stacks. To avoid duplication in this case, the loader should detect when `basePath` resolves to `PROJECT_ROOT` and skip the "marketplace" tier.

### Stacks Reference Skills Not in Consumer's Source

**Handling:** Stacks are opaque skill-ID maps. The wizard pre-selects skills from the stack; if a skill ID doesn't exist in the matrix, it's silently ignored (the skill just won't appear selected). The compile step validates skill availability separately. No change needed.

### Performance: Additional `loadStacks()` Calls

**Impact:** Adding one more `loadStacks()` call for CLI stacks (which is now always loaded, not just as fallback) and one for project stacks. Both are cached by path key. The CLI stacks are typically already cached from other flows. Negligible performance impact.

---

## Files Summary

| File                                            | Action                                               | Lines Changed (est.) |
| ----------------------------------------------- | ---------------------------------------------------- | -------------------- |
| `src/cli/types/stacks.ts`                       | Add `StackOrigin` type                               | +1                   |
| `src/cli/types/matrix.ts`                       | Add `origin?`, `originLabel?` to `ResolvedStack`     | +2                   |
| `src/cli/lib/loading/source-loader.ts`          | Multi-origin loading, project stacks, exclusion rule | ~60 modified         |
| `src/cli/components/wizard/stack-selection.tsx` | Section grouping, headers, navigation                | ~50 modified         |
| `src/cli/lib/loading/source-loader.test.ts`     | Origin tagging, exclusion, project stacks tests      | ~80 new              |
| `src/cli/components/wizard/step-stack.test.tsx` | Section rendering, navigation tests                  | ~60 new              |

**Not changed:**

- `src/cli/lib/stacks/stacks-loader.ts` -- origin is assigned by caller, not the loader
- `src/cli/lib/schemas.ts` -- origin is not part of YAML schema
- `src/cli/lib/configuration/config.ts` -- `stacksFile` already exists
- `src/cli/stores/wizard-store.ts` -- stacks come from matrix, not the store

---

## Future: Global Tier (Deferred to D-36)

When D-36 (global install support) introduces `~/.config/agents-inc/` or `~/.claude-src/`:

1. Add `"global"` to `StackOrigin` union
2. Load global stacks from the global config's `stacksFile` in `loadSkillsMatrixFromSource()`
3. Insert between project and marketplace in the hierarchy
4. No other changes needed -- the grouping/rendering logic handles arbitrary origins

---

## Test Plan

### Unit Tests: Loader (`source-loader.test.ts`)

| Test Case                                | Assertion                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Source with stacks.yaml                  | Stacks tagged with `origin: "marketplace"`, correct `originLabel`                    |
| CLI stacks always loaded                 | Stacks tagged with `origin: "public"`, `originLabel: "Agents Inc"`                   |
| Source + CLI stacks combined             | Both tiers present, marketplace before public                                        |
| Project `stacksFile` configured          | Project stacks at top with `origin: "project"`                                       |
| Project `stacksFile` missing file        | No project section, no error                                                         |
| Project has no config                    | No project section                                                                   |
| Private source: public excluded          | Only project + marketplace stacks remain                                             |
| Default source: public NOT excluded      | Public stacks visible                                                                |
| Ordering: project > marketplace > public | Verify array order                                                                   |
| Default source = no duplication          | When source IS the default, only "public" tier exists (no "marketplace" duplication) |

### Component Tests: Stack Selection (`step-stack.test.tsx`)

| Test Case                                    | Assertion                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| Multi-origin stacks: section headers visible | "Your Project", marketplace name rendered                                 |
| Single-origin stacks: no section headers     | Flat list like today                                                      |
| Keyboard nav skips headers                   | Down arrow goes from last stack in section to first stack in next section |
| "Start from scratch" reachable               | Always last selectable item                                               |
| Empty stacks: only scratch shown             | No headers, just "Start from scratch"                                     |
| Stack selection works in grouped mode        | Selecting a stack sets correct `selectedStackId`                          |
| Existing tests pass                          | No regressions in flat-list behavior                                      |
