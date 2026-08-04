# Research: User-Defined Stacks in Consumer Projects (D-08 Expansion)

## 1. Current State

### Stack Data Model

**File:** `src/cli/types/stacks.ts:9-16`

```typescript
export type Stack = {
  id: string
  name: string
  description: string
  agents: Partial<Record<AgentName, StackAgentConfig>>
  philosophy?: string
}
```

**File:** `src/cli/types/matrix.ts:273-284` -- The resolved form used by the wizard:

```typescript
export type ResolvedStack = {
  id: string
  name: string
  description: string
  audience: string[]
  skills: Partial<Record<AgentName, Partial<Record<Category, SkillId>>>>
  allSkillIds: SkillId[]
  philosophy: string
}
```

Neither `Stack` nor `ResolvedStack` currently has an `origin` or `source` field to indicate where the stack came from.

### Stack Loading

**File:** `src/cli/lib/stacks/stacks-loader.ts:52-92`

`loadStacks(configDir, stacksFile?)` is the core loader:

- Takes a `configDir` (base path) and optional `stacksFile` (relative path to stacks YAML)
- Defaults `stacksFile` to `STACKS_FILE_PATH` ("config/stacks.ts") from `consts.ts:25`
- Parses the YAML against `stacksConfigSchema` (Zod)
- Normalizes agent configs via `normalizeAgentConfig()`
- Caches results by `${configDir}:${resolvedStacksFile}`
- Returns `Stack[]`

### How Stacks Reach the Wizard

**File:** `src/cli/lib/loading/source-loader.ts:148-185` -- `loadAndMergeFromBasePath()`

This is the key function. It:

1. Reads source config for `stacks_file` override (line 153)
2. Loads stacks from the source first: `loadStacks(basePath, stacksRelFile)` (line 176)
3. Falls back to CLI's built-in stacks: `loadStacks(PROJECT_ROOT)` (line 177)
4. Converts all stacks to `ResolvedStack[]` and assigns to `mergedMatrix.suggestedStacks` (line 179)

**Critically:** Today this is an either/or choice. If the source has stacks, those are used exclusively. If not, the CLI's built-in stacks are used. There is **no merging** of stacks from multiple origins.

**File:** `src/cli/lib/matrix/matrix-loader.ts:486-488` -- `resolveSuggestedStacks()` returns `[]`. The actual stacks are injected later by `source-loader.ts`.

### Stack Rendering in the Wizard

**File:** `src/cli/components/wizard/stack-selection.tsx:25-111`

The `StackSelection` component:

- Gets stacks from `matrix.suggestedStacks` (line 30)
- Renders them as a flat list using `MenuItem` components (lines 83-90)
- Adds a "Start from scratch" option after a horizontal divider (lines 91-102)
- Uses keyboard navigation with up/down arrows and Enter to select
- No grouping, no section headers -- all stacks are displayed in a single flat list

**File:** `src/cli/components/wizard/step-stack.tsx:20-28`

`StepStack` is a thin wrapper that either shows `StackSelection` (when `approach === null`) or `DomainSelection` (when approach is set).

### Config Schema for Consumer Projects

**File:** `src/cli/lib/configuration/config.ts:38-51` -- `ProjectSourceConfig`

Already has `stacks_file?: string` (line 49). This currently points to a stacks file **within the source/marketplace** directory, not in the consumer project. It's used by the `source-loader.ts` to locate the stacks file relative to the source's base path.

**File:** `src/cli/lib/schemas.ts:765` -- Already has Zod validation for `stacks_file`.

### Source Resolution

**File:** `src/cli/lib/configuration/config.ts:100-148` -- `resolveSource()`

Resolves the primary skills source with precedence: flag > env > project > default. Returns `ResolvedConfig` with `source`, `sourceOrigin`, and `marketplace`.

**File:** `src/cli/lib/configuration/config.ts:240-265` -- `resolveAllSources()`

Returns `{ primary, extras }` where `primary` is the resolved source and `extras` are additional sources from `ProjectSourceConfig.sources[]`.

**File:** `src/cli/lib/configuration/source-manager.ts:69-105` -- `getSourceSummary()`

Lists all configured sources with their enabled state.

### Private vs Public Source Detection

The system differentiates sources by:

- **Default source:** `github:agents-inc/skills` (from `config.ts:19`)
- **Private marketplace:** When `ProjectSourceConfig.source` points to a non-default URL
- **Extra sources:** `ProjectSourceConfig.sources[]` array (from `config.ts:43`)

**File:** `src/cli/lib/loading/source-loader.ts:246-266` -- `getMarketplaceLabel()`

Computes a display label based on whether the source is local, the default public source, or a private marketplace. This function already understands the concept of "private vs public" sources.

---

## 2. Config Changes Needed

### Consumer Project's `.claude-src/config.yaml`

The `stacks_file` field in `ProjectSourceConfig` currently serves a different purpose -- it tells a **source** (marketplace) where to find its own stacks. For consumer projects, a new field or reuse of this field is needed.

**Option A: Reuse `stacks_file` in consumer config**

The consumer's `.claude-src/config.yaml` already supports `stacks_file`. Currently it's only read from the source's config, but it could be read from the consumer's config too:

```yaml
# .claude-src/config.yaml (consumer project)
source: github:acme-corp/skills
stacks_file: stacks/my-stacks.ts # project-level stacks
```

This would mean `stacks_file` has dual meaning depending on context (source vs consumer), which could be confusing.

**Option B: New `project_stacks_file` field (recommended)**

Add a distinct field that specifically points to project-level stacks:

```yaml
# .claude-src/config.yaml (consumer project)
source: github:acme-corp/skills
project_stacks: stacks/my-stacks.ts # project-level stacks
```

**Option C: Use `stacks_file` but load from project root**

The simplest approach: `stacks_file` in the consumer's `.claude-src/config.yaml` is interpreted relative to the project root (not the source root). This is actually already how it's stored, but `loadAndMergeFromBasePath()` only reads `stacks_file` from the **source's** config. Adding a separate read from the **consumer's** config would provide project-level stacks.

**Recommended: Option C**. The field already exists in the schema and config type. The only change needed is reading it from the consumer's project config in addition to the source's config.

---

## 3. Stack Origin Tracking

### Current State

Neither `Stack` nor `ResolvedStack` has an origin field. All stacks are treated identically.

### Proposed Addition

Add an `origin` field to both types:

```typescript
// In types/stacks.ts
export type StackOrigin = "project" | "marketplace" | "public"

export type Stack = {
  id: string
  name: string
  description: string
  agents: Partial<Record<AgentName, StackAgentConfig>>
  philosophy?: string
  origin?: StackOrigin // NEW
  originLabel?: string // NEW - display name (e.g., "Acme Corp")
}
```

```typescript
// In types/matrix.ts
export type ResolvedStack = {
  id: string
  name: string
  description: string
  audience: string[]
  skills: Partial<Record<AgentName, Partial<Record<Category, SkillId>>>>
  allSkillIds: SkillId[]
  philosophy: string
  origin?: StackOrigin // NEW
  originLabel?: string // NEW
}
```

Both fields are optional for backward compatibility. Stacks without an origin default to "public".

The `originLabel` provides a human-readable name for the section header (e.g., "Your Project", "Acme Corp Marketplace", "Agents Inc (public)").

---

## 4. Loader Changes

### Current Flow (source-loader.ts:148-185)

```
loadAndMergeFromBasePath(basePath)
  -> loadStacks(basePath, stacksRelFile)   // source stacks
  -> OR loadStacks(PROJECT_ROOT)            // CLI built-in stacks
  -> mergedMatrix.suggestedStacks = stacks
```

### Proposed Flow

```
loadSkillsMatrixFromSource(options)
  -> loadAndMergeFromBasePath(basePath)     // marketplace or public stacks
  -> loadProjectStacks(projectDir)          // consumer project stacks (NEW)
  -> merge all stacks with origin tags
  -> apply exclusion rule (hide public if private exists)
  -> mergedMatrix.suggestedStacks = mergedStacks
```

### Detailed Changes

**1. `loadAndMergeFromBasePath()` -- Tag source stacks with origin**

Currently at `source-loader.ts:176-182`:

```typescript
// Current
const sourceStacks = await loadStacks(basePath, stacksRelFile)
const stacks =
  sourceStacks.length > 0 ? sourceStacks : await loadStacks(PROJECT_ROOT)
if (stacks.length > 0) {
  mergedMatrix.suggestedStacks = stacks.map((stack) =>
    convertStackToResolvedStack(stack)
  )
}
```

Needs to tag stacks with origin and stop doing the either/or:

```typescript
// Proposed
const sourceStacks = await loadStacks(basePath, stacksRelFile)
const cliStacks = await loadStacks(PROJECT_ROOT)

// Tag origins
const taggedSourceStacks = sourceStacks.map((s) => ({
  ...convertStackToResolvedStack(s),
  origin: "marketplace" as StackOrigin,
  originLabel: marketplace ?? extractSourceName(source),
}))

const taggedCliStacks = cliStacks.map((s) => ({
  ...convertStackToResolvedStack(s),
  origin: "public" as StackOrigin,
  originLabel: "Agents Inc (public)",
}))

mergedMatrix.suggestedStacks = [...taggedSourceStacks, ...taggedCliStacks]
```

**2. `loadSkillsMatrixFromSource()` -- Load consumer project stacks**

After `loadAndMergeFromBasePath()` returns, before returning the result, load project-level stacks:

```typescript
// In loadSkillsMatrixFromSource(), after line 81
const consumerConfig = projectDir
  ? await loadProjectSourceConfig(projectDir)
  : null
if (consumerConfig?.stacks_file) {
  const projectStacks = await loadStacks(
    resolvedProjectDir,
    consumerConfig.stacks_file
  )
  const taggedProjectStacks = projectStacks.map((s) => ({
    ...convertStackToResolvedStack(s),
    origin: "project" as StackOrigin,
    originLabel: "Your Project",
  }))
  // Prepend project stacks (they go at the top)
  result.matrix.suggestedStacks = [
    ...taggedProjectStacks,
    ...result.matrix.suggestedStacks,
  ]
}
```

**3. Apply exclusion rule**

After all stacks are assembled, hide public stacks if a private marketplace is configured:

```typescript
// If a private marketplace source is configured, exclude public stacks
const hasPrivateSource = sourceConfig.source !== DEFAULT_SOURCE
if (hasPrivateSource) {
  result.matrix.suggestedStacks = result.matrix.suggestedStacks.filter(
    (s) => s.origin !== "public"
  )
}
```

---

## 5. Wizard UI Changes

### Current Rendering (stack-selection.tsx)

The component renders a flat list of all stacks, then a divider, then "Start from scratch". No section headers or grouping.

### Proposed Rendering

Group stacks by `origin` with section headers:

```
[1] Choose a stack

  Your Project
  > Custom Work Stack    Full-stack for internal tools
    Custom API Stack

  Acme Corp Marketplace
    Acme Full Stack
    Acme Backend Stack

  ────────────────────────────────
  Start from scratch    Select domains and skills manually
```

If a private marketplace is configured, the "Agents Inc (public)" section is hidden entirely.

### Implementation Approach

**File:** `src/cli/components/wizard/stack-selection.tsx`

1. Group `matrix.suggestedStacks` by `origin` into sections
2. Compute section headers from `originLabel`
3. Build a flat navigation index that spans all items (for keyboard nav)
4. Render sections with headers between them
5. Keep the divider before "Start from scratch"

The grouping logic:

```typescript
type StackSection = {
  label: string
  origin: StackOrigin
  stacks: ResolvedStack[]
}

function groupStacksByOrigin(stacks: ResolvedStack[]): StackSection[] {
  const groups = new Map<string, StackSection>()
  const ORDER: StackOrigin[] = ["project", "marketplace", "public"]

  for (const stack of stacks) {
    const origin = stack.origin ?? "public"
    const key = origin
    if (!groups.has(key)) {
      groups.set(key, {
        label: stack.originLabel ?? origin,
        origin,
        stacks: [],
      })
    }
    groups.get(key)!.stacks.push(stack)
  }

  return ORDER.filter((o) => groups.has(o)).map((o) => groups.get(o)!)
}
```

The keyboard navigation index needs to map flat indices to (section, stackIndex) pairs. The section headers are not selectable items -- only stacks and "Start from scratch" are.

### Exclusion Rule Implementation

The exclusion rule (hide public when private source exists) should be applied **before** the stacks reach the wizard, in the loader layer. This keeps the UI component simple -- it just renders whatever `suggestedStacks` contains.

The UI component does not need to know about the exclusion rule. It just groups and renders.

---

## 6. Schema Changes

### Zod Schemas (src/cli/lib/schemas.ts)

**stackSchema (line 600-608)** -- Add optional origin fields:

```typescript
export const stackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  agents: z.record(z.string(), stackAgentConfigSchema),
  philosophy: z.string().optional(),
  // No origin in schema -- origin is assigned programmatically by the loader
})
```

The `origin` and `originLabel` fields should NOT be in the YAML schema. They are assigned programmatically by the loader based on where the stacks were loaded from. The YAML file format (`stacks.ts`) stays unchanged.

### Type Changes

**`src/cli/types/stacks.ts`** -- Add `StackOrigin` type:

```typescript
export type StackOrigin = "project" | "marketplace" | "public"
```

**`src/cli/types/matrix.ts`** -- Add origin fields to `ResolvedStack`:

```typescript
export type ResolvedStack = {
  // ... existing fields ...
  origin?: StackOrigin
  originLabel?: string
}
```

### Config Schema

No changes needed to `projectSourceConfigSchema` -- `stacks_file` already exists and is validated.

---

## 7. Files That Would Need to Change

| File                                            | Description                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/cli/types/stacks.ts`                       | Add `StackOrigin` type export                                                   |
| `src/cli/types/matrix.ts`                       | Add `origin?` and `originLabel?` to `ResolvedStack`                             |
| `src/cli/types/index.ts`                        | Export `StackOrigin` if not already re-exported                                 |
| `src/cli/lib/loading/source-loader.ts`          | Main changes: tag stacks with origin, load project stacks, apply exclusion rule |
| `src/cli/components/wizard/stack-selection.tsx` | Group stacks by origin with section headers, update navigation indices          |
| `src/cli/lib/stacks/stacks-loader.ts`           | No changes needed (origin is assigned by caller, not by the loader)             |
| `src/cli/lib/schemas.ts`                        | No changes needed (origin is not part of YAML schema)                           |
| `src/cli/lib/configuration/config.ts`           | No changes needed (`stacks_file` already exists)                                |
| `src/cli/stores/wizard-store.ts`                | Possibly no changes (stacks come from matrix, not the store)                    |
| `src/cli/lib/__tests__/helpers.ts`              | Update `createMockResolvedStack` factory to support `origin`                    |
| `src/cli/components/wizard/step-stack.test.tsx` | Add tests for grouped rendering, exclusion rule                                 |
| `src/cli/lib/loading/source-loader.test.ts`     | Add tests for project stacks loading, origin tagging, exclusion                 |

---

## 8. Edge Cases

### Duplicate Stack IDs Across Sources

- **Risk:** A project stack has `id: "nextjs-fullstack"` which also exists in the public stacks.
- **Mitigation:** Allow duplicates. Each stack is tagged with its origin, so they appear in different sections. The user sees both and can choose either.
- **Alternative:** Deduplicate by ID, with project stacks taking priority over marketplace, which takes priority over public. This is more opinionated but prevents confusion.
- **Recommended:** Allow duplicates but prepend the origin as a namespace qualifier when storing the selection (e.g., `project:nextjs-fullstack`). Alternatively, since `selectedStackId` is just used to look up the stack in `suggestedStacks`, and the array is ordered, the first match (project) would naturally win if using `.find()`.

### Missing Stacks File

- **Current behavior:** `loadStacks()` returns `[]` if the file doesn't exist (line 60-63).
- **No change needed.** If `stacks_file` points to a nonexistent file, the project section simply won't appear.

### Empty Stacks File

- **Current behavior:** `stacksConfigSchema` requires at least 1 stack (`.min(1)` on the array).
- **Impact:** An empty stacks file would fail validation.
- **Mitigation:** Either allow empty arrays (remove `.min(1)`) or catch the validation error and return `[]` for project stacks. The latter is more forgiving for consumer projects.

### No Private Source Configured

- When `sourceConfig.source === DEFAULT_SOURCE` (the public one), there is no private marketplace.
- The exclusion rule does not apply -- public stacks are shown.
- If extra sources exist in `sources[]`, those might provide stacks too. The current proposal does not load stacks from extra sources -- only from the primary source. This could be a future extension.

### Consumer Project Has No `.claude-src/config.yaml`

- `loadProjectSourceConfig()` returns `null` (line 74-76 in config.ts).
- No project stacks are loaded. The wizard shows only marketplace/public stacks.

### `stacks_file` Is an Absolute Path

- `loadStacks()` uses `path.join(configDir, resolvedStacksFile)` (line 58).
- If `stacks_file` is absolute (starts with `/`), `path.join` still works but the `configDir` is effectively ignored.
- **Mitigation:** Validate that `stacks_file` is a relative path. Already partially handled by source validation, but could add an explicit check.

### Stacks Reference Skills Not in the Consumer's Source

- A project stack might reference skill IDs that exist in the project but not in the marketplace.
- This works fine at the stack level (stacks are just configuration maps). But at compile time, the skills need to be resolvable.
- **No change needed** for the wizard -- stacks are opaque selections. The compile step already validates skill availability.

### Consumer Uses Multiple Extra Sources

- Each extra source in `sources[]` could theoretically provide its own stacks.
- **Current proposal:** Only load stacks from the primary source and from the project, not from extra sources. This keeps scope manageable and matches the spec.
- **Future extension:** Load stacks from extra sources too, each in their own section.

---

## 9. Implementation Plan

### Phase 1: Type and Model Changes (Small, Safe)

1. Add `StackOrigin` type to `src/cli/types/stacks.ts`
2. Add `origin?` and `originLabel?` to `ResolvedStack` in `src/cli/types/matrix.ts`
3. Update `src/cli/types/index.ts` to re-export `StackOrigin`
4. Update `createMockResolvedStack` in `src/cli/lib/__tests__/helpers.ts` to accept `origin`

### Phase 2: Loader Changes (Core Logic)

5. Modify `convertStackToResolvedStack()` in `source-loader.ts` to accept and pass through `origin` and `originLabel`
6. Modify `loadAndMergeFromBasePath()` in `source-loader.ts` to:
   - Always load both source stacks and CLI stacks (not either/or)
   - Tag each with the correct origin
7. Modify `loadSkillsMatrixFromSource()` in `source-loader.ts` to:
   - Load project-level stacks from consumer's `stacks_file` config
   - Tag with `origin: "project"`
   - Prepend to `suggestedStacks`
8. Apply exclusion rule: filter out `origin: "public"` stacks when a private source is configured

### Phase 3: UI Changes (Wizard)

9. Add grouping logic to `stack-selection.tsx`:
   - Group stacks by `origin` into sections
   - Render section headers (dimmed text label for each group)
   - Update keyboard navigation to handle section headers (non-selectable items)
   - Keep "Start from scratch" at the bottom after all sections

### Phase 4: Testing

10. Unit tests for origin tagging in `source-loader.test.ts`
11. Unit tests for exclusion rule
12. Unit tests for project stacks loading
13. Component tests for grouped rendering in `step-stack.test.tsx`
14. Integration test: project + marketplace + public stacks in correct order

### Estimated Complexity

- **Type changes:** Simple (~10 lines)
- **Loader changes:** Medium (~60-80 lines of new/modified code)
- **UI changes:** Medium (~40-60 lines for grouping and rendering)
- **Tests:** Medium (~100-150 lines)

Total estimated scope: ~250-300 lines of new/modified code plus tests.

---

## 10. Open Questions

1. **Should project stacks use the same `stacks.ts` schema as marketplace stacks?** The current schema requires `agents` with full agent-to-skill mappings. For consumer projects, a simpler format (just a list of skill IDs or a stack name reference) might be more user-friendly. However, using the same schema keeps things consistent.

2. **Should the exclusion rule be configurable?** The spec says "hide public when private source exists." But some users might want both. Could add a `show_public_stacks: true` config option. For v1, strict exclusion per the spec.

3. **What label format for section headers?** The spec shows "Your Project", "Acme Corp Marketplace", and "Agents Inc (public)". The "Your Project" label is hardcoded. The marketplace label can come from `getMarketplaceLabel()` or the marketplace name. The public label can be hardcoded. This seems sufficient.

4. **Stacks from extra sources?** The spec mentions private marketplace sources (plural), but the current architecture only has one primary source plus extra sources. Should each extra source's stacks also be shown? The spec diagram shows a single "Acme Corp Marketplace" section, suggesting one private source. For v1, only primary source stacks are treated as "marketplace". Extra sources could be a future enhancement.
