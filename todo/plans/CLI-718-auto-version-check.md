# CLI-718: Auto-Version Check + Source Staleness -- Refinement

**Status:** Refinement complete, ready for implementation
**Priority:** Medium
**Estimated effort:** Small (Feature 1) + Small (Feature 2)
**Research doc:** [docs/cli/research/auto-version-check.md](../../docs/cli/research/auto-version-check.md)

---

## Open Questions (All Resolved)

### Feature 1: Version Check

1. **Check frequency:** **RESOLVED:** 1 day. Reduce the oclif plugin's `timeoutInDays` from 60 to 1.

2. **Display format:** **RESOLVED:** Keep it simple — show "update available" or similar next to the version. Exact format TBD by implementer, but the intent is a brief, non-intrusive prompt.

3. **Suppress mechanism:** **RESOLVED:** No suppression. Always show "Update available" when a newer version exists.

### Feature 2: Source Staleness

4. **Default TTL:** **RESOLVED:** 1 hour as a constant. No configuration needed.

5. **Fallback on network failure:** **RESOLVED:** Silently use stale cache with `verbose()` log.

6. **giget ETag interaction:** **RESOLVED:** Yes — call `clearGigetCache()` during TTL refresh.

---

## Current State Analysis

### Version Display Chain

Version flows through this prop chain:

1. **Command level** (`init.tsx:113`, `edit.tsx:123`): `this.config.version` is passed to `<Wizard version={...}>`.
2. **Wizard** (`wizard.tsx:48,283`): Accepts `version?: string` prop, passes to `<WizardLayout version={version}>`.
3. **WizardLayout** (`wizard-layout.tsx:79,111`): Accepts `version?: string`, passes to `<WizardTabs version={version}>`.
4. **WizardTabs** (`wizard-tabs.tsx:17,109`): Renders `<Text dimColor>{v${version}}</Text>` at the far right of the tab bar.

### Oclif Plugin: `@oclif/plugin-warn-if-update-available` v3.1.55

**Installed at:** `package.json:57` (plugins) and `package.json:101` (dependencies).

**No custom configuration yet** -- the `oclif` block in `package.json` has no `warn-if-update-available` key, so all defaults apply.

**How it works** (from `node_modules/@oclif/plugin-warn-if-update-available/lib/hooks/init/check-update.js`):

- Runs as an oclif `init` hook on every CLI invocation.
- Reads cache file at `{config.cacheDir}/version` (on this system: `~/.cache/agents-inc/version`).
- If cache file mtime is older than `timeoutInDays` (default: 60), spawns a **detached background process** (`get-version.js`) that fetches npm dist-tags and writes them to the cache.
- If cached `latest` version is newer than running version, displays a `this.warn()` after command execution.
- Skips for prerelease versions (version containing `-`).

**Cache file format** (`~/.cache/agents-inc/version`):

```json
{ "current": "0.31.1" }
```

After a successful npm fetch, it becomes:

```json
{ "latest": "0.36.0", "next": "0.37.0-beta.1", "current": "0.35.0" }
```

The `dist-tags` object from npm is spread into the file, plus `current` from the running version.

**Key file:** `get-version.js` writes `{...body['dist-tags'], current: version}`.

**Warning frequency:** Separate from cache refresh -- controlled by `frequency`/`frequencyUnit` config (defaults to no throttling; a `last-warning` file tracks when the warning was last shown).

### Init Hook (`src/cli/hooks/init.ts`)

Currently only resolves the `--source` flag and attaches `sourceConfig` to the oclif config object. This is the natural place to also read the version cache and attach `latestVersion`.

**Pattern:** Uses a narrow interface `ConfigWithSource` for the boundary cast. The same pattern should be used for `latestVersion`.

### Source Fetcher (`src/cli/lib/loading/source-fetcher.ts`)

- `fetchFromRemoteSource()` (line 150): checks `forceRefresh` and `directoryExists(cacheDir)`. If both pass, returns cached path with **no TTL check**.
- `clearGigetCache()` (line 140): removes giget's tarball/ETag cache for a source.
- Cache directories: `~/.cache/agents-inc/sources/{readable}-{hash}`.
- No `.last-fetched` timestamp file exists anywhere in the codebase.

### Constants (`src/cli/consts.ts`)

- `CACHE_DIR = path.join(os.homedir(), ".cache", DEFAULT_PLUGIN_NAME)` -- the base cache directory.
- No TTL or staleness constants exist yet.

---

## Feature 1: CLI Version Check in Wizard Header

### Implementation Plan

**Approach:** Read the oclif plugin's existing cache file in the init hook, compare versions, thread `latestVersion` through the existing prop chain to WizardTabs.

#### Step 1: Configure oclif plugin frequency (`package.json`)

Add `warn-if-update-available` configuration to the `oclif` block:

```json
"oclif": {
  ...existing config...,
  "warn-if-update-available": {
    "timeoutInDays": 1
  }
}
```

This reduces the background npm check from 60 days to 1 day. The plugin already handles the background spawn.

#### Step 2: Read version cache in init hook (`src/cli/hooks/init.ts`)

After the existing source resolution, read `{config.cacheDir}/version`:

- Parse the JSON file.
- Compare `distTags.latest` against `config.version` using `localeCompare` with `{numeric: true}` (same approach as the oclif plugin itself).
- If a newer version exists, attach `latestVersion` to the oclif config object.
- Wrap in try/catch -- if the file doesn't exist or is invalid, silently ignore.

Add a new interface alongside the existing `ConfigWithSource`:

```typescript
interface ConfigWithVersionCheck {
  latestVersion?: string
}
```

#### Step 3: Add getter in BaseCommand (`src/cli/base-command.ts`)

Following the `sourceConfig` getter pattern:

```typescript
public get latestVersion(): string | undefined {
  return (this.config as unknown as ConfigWithVersionCheck).latestVersion;
}
```

#### Step 4: Thread prop through commands (`init.tsx`, `edit.tsx`)

Both commands already pass `version={this.config.version}` to `<Wizard>`. Add `latestVersion={this.latestVersion}`.

#### Step 5: Thread through Wizard -> WizardLayout -> WizardTabs

- `WizardProps`: Add `latestVersion?: string`.
- `WizardLayoutProps`: Add `latestVersion?: string`.
- `WizardTabsProps`: Add `latestVersion?: string`.
- Each component forwards the prop to the next level.

#### Step 6: Render in WizardTabs (`wizard-tabs.tsx`)

Replace the current version display (line 108-110):

```tsx
// Current:
<Box flexGrow={1} justifyContent="flex-end">
  <Text dimColor>{`v${version}`}</Text>
</Box>

// Proposed:
<Box flexGrow={1} justifyContent="flex-end" columnGap={1}>
  <Text dimColor>{`v${version}`}</Text>
  {latestVersion && (
    <Text color={CLI_COLORS.WARNING}>{`\u2192 v${latestVersion} available`}</Text>
  )}
</Box>
```

### Files Changed (Feature 1)

| File                                          | Change                                                          |
| --------------------------------------------- | --------------------------------------------------------------- |
| `package.json`                                | Add `warn-if-update-available.timeoutInDays: 1` to oclif config |
| `src/cli/hooks/init.ts`                       | Read version cache, compare, attach `latestVersion`             |
| `src/cli/base-command.ts`                     | Add `latestVersion` getter (following `sourceConfig` pattern)   |
| `src/cli/commands/init.tsx`                   | Pass `latestVersion` prop to `<Wizard>`                         |
| `src/cli/commands/edit.tsx`                   | Pass `latestVersion` prop to `<Wizard>`                         |
| `src/cli/components/wizard/wizard.tsx`        | Accept and forward `latestVersion` prop                         |
| `src/cli/components/wizard/wizard-layout.tsx` | Accept and forward `latestVersion` prop                         |
| `src/cli/components/wizard/wizard-tabs.tsx`   | Accept `latestVersion`, render conditionally                    |

---

## Feature 2: Source Staleness (TTL-based Auto-Refresh)

### Implementation Plan

**Approach:** Add a `.last-fetched` timestamp file to each source cache directory. Before returning a cached result, check if the timestamp exceeds the TTL. If stale, re-fetch (with fallback to cache on network failure).

#### Step 1: Add constant (`src/cli/consts.ts`)

```typescript
/** How long cached remote sources remain fresh before auto-refreshing (milliseconds) */
export const SOURCE_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
```

#### Step 2: Add helper functions (`src/cli/lib/loading/source-fetcher.ts`)

Two new module-level functions:

```typescript
/** Check if the source cache is stale based on .last-fetched timestamp */
async function isSourceStale(lastFetchedFile: string): Promise<boolean> {
  try {
    const content = await readFileSafe(lastFetchedFile, MAX_CONFIG_FILE_SIZE)
    const fetchedTime = new Date(content.trim()).getTime()
    if (Number.isNaN(fetchedTime)) return true
    return Date.now() - fetchedTime > SOURCE_CACHE_TTL_MS
  } catch {
    // No .last-fetched file -- treat as stale for existing caches
    // that were created before this feature was added
    return true
  }
}

/** Write the current timestamp to .last-fetched */
async function writeLastFetched(lastFetchedFile: string): Promise<void> {
  await writeFile(lastFetchedFile, new Date().toISOString())
}
```

The `readFileSafe` utility already exists in `utils/fs.ts`. For the write side, use the `writeFile` from `node:fs/promises` (already imported in test files, add import if needed).

#### Step 3: Modify `fetchFromRemoteSource()` (`source-fetcher.ts`)

Replace the current cache-hit logic (lines 159-166):

```typescript
// Current:
if (!forceRefresh && (await directoryExists(cacheDir))) {
  verbose(`Using cached source: ${cacheDir}`)
  return { path: cacheDir, fromCache: true, source: fullSource }
}

// Proposed:
if (!forceRefresh && (await directoryExists(cacheDir))) {
  const lastFetchedFile = path.join(cacheDir, ".last-fetched")
  const stale = await isSourceStale(lastFetchedFile)

  if (!stale) {
    verbose(`Using cached source: ${cacheDir}`)
    return { path: cacheDir, fromCache: true, source: fullSource }
  }

  // Cache is stale -- attempt refresh, fall back to cache on failure
  verbose(`Cache is stale, re-fetching: ${fullSource}`)
  try {
    await clearGigetCache(source)
    await remove(cacheDir)
    // Fall through to the download logic below
  } catch (error) {
    verbose(
      `Failed to clear stale cache, using existing: ${getErrorMessage(error)}`
    )
    return { path: cacheDir, fromCache: true, source: fullSource }
  }
}
```

After a successful download (after `downloadTemplate` returns), write the timestamp:

```typescript
await writeLastFetched(path.join(result.dir, ".last-fetched"))
```

**Fallback behavior on network failure:** If the re-fetch fails (after cache was already cleared), wrap the download in a try/catch that falls back to the cache if it still exists. If the cache was already removed, the error propagates (same as current behavior).

Revised approach to be safer -- don't remove the cache before a successful re-fetch:

```typescript
if (!stale) {
  verbose(`Using cached source: ${cacheDir}`)
  return { path: cacheDir, fromCache: true, source: fullSource }
}

verbose(`Cache is stale, re-fetching: ${fullSource}`)
try {
  await clearGigetCache(source)
  // Don't remove cacheDir yet -- download to a temp dir first, then swap
  // Actually: giget's downloadTemplate with force:true overwrites in-place
  // So we can just re-download to the same dir
  const result = await downloadTemplate(fullSource, {
    dir: cacheDir,
    force: true,
    offline: false,
  })
  await writeLastFetched(path.join(result.dir, ".last-fetched"))
  return { path: result.dir, fromCache: false, source: fullSource }
} catch (error) {
  // Network failure during TTL refresh -- use stale cache
  verbose(`Auto-refresh failed, using stale cache: ${getErrorMessage(error)}`)
  return { path: cacheDir, fromCache: true, source: fullSource }
}
```

This is safer because the cache directory is never removed before a successful download. If the download fails, the stale cache is still intact.

### Files Changed (Feature 2)

| File                                    | Change                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/cli/consts.ts`                     | Add `SOURCE_CACHE_TTL_MS` constant                                                      |
| `src/cli/lib/loading/source-fetcher.ts` | Add `isSourceStale()`, `writeLastFetched()`; modify `fetchFromRemoteSource()` TTL check |

---

## Step-by-Step Implementation Plan

### Phase 1: CLI Version Check (Feature 1)

1. Add `warn-if-update-available` config to `package.json` oclif block.
2. Add `ConfigWithVersionCheck` interface and version cache reading logic to `hooks/init.ts`.
3. Add `latestVersion` getter to `base-command.ts` (following `sourceConfig` pattern).
4. Pass `latestVersion` prop in `init.tsx` and `edit.tsx`.
5. Thread `latestVersion` through `wizard.tsx` -> `wizard-layout.tsx` -> `wizard-tabs.tsx` (add to each component's props type).
6. Render update-available text conditionally in `wizard-tabs.tsx`.
7. Add test for update-available rendering in `wizard-tabs.test.tsx`.

### Phase 2: Source Staleness (Feature 2)

1. Add `SOURCE_CACHE_TTL_MS` constant to `consts.ts`.
2. Add `isSourceStale()` and `writeLastFetched()` functions to `source-fetcher.ts`.
3. Modify `fetchFromRemoteSource()` to check TTL before returning cached results.
4. Implement safe fallback: on network failure during TTL refresh, use stale cache.
5. After successful download, write `.last-fetched` timestamp.
6. Add tests for TTL behavior in `source-fetcher.test.ts` or `source-fetcher-refresh.test.ts`.

---

## Edge Cases

### Feature 1: Version Check

| Edge Case                                                                 | Behavior                                                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **First-ever run (no cache file)**                                        | `latestVersion` is undefined. WizardTabs shows only current version. Oclif plugin creates cache via background process; next run will have data. |
| **Offline / air-gapped**                                                  | Background npm fetch fails silently. Cache remains stale (or never created). No update text shown.                                               |
| **Pre-release version** (e.g., `0.36.0-beta.1`)                           | Oclif plugin skips check for versions containing `-`. No `latestVersion` attached.                                                               |
| **npm registry down**                                                     | Background child process catches error and exits. Cache retains last-known values.                                                               |
| **Cache has only `current` key** (first write before npm fetch completes) | `distTags.latest` is undefined. No `latestVersion` attached.                                                                                     |
| **Same version** (`latest === current`)                                   | Comparison finds no newer version. No update text shown.                                                                                         |
| **Fast startup requirement**                                              | Reading a small local JSON file is sub-millisecond. No impact on startup time.                                                                   |

### Feature 2: Source Staleness

| Edge Case                                                    | Behavior                                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **First fetch (no cache)**                                   | Cache directory doesn't exist. Falls through to normal download path. `.last-fetched` written after download.                   |
| **Existing cache, no `.last-fetched` file** (migrated cache) | `isSourceStale()` returns `true` (file doesn't exist). Triggers refresh. After download, `.last-fetched` written.               |
| **Network failure during TTL refresh**                       | Falls back to stale cache with `verbose()` log. Does not propagate error.                                                       |
| **`--refresh` flag**                                         | Existing `forceRefresh` path is unchanged. Always re-downloads regardless of TTL. `.last-fetched` written after download.       |
| **Clock skew (system clock jumps backward)**                 | `Date.now() - fetchedTime` could be negative. Since negative < TTL, cache treated as fresh. Correct behavior.                   |
| **Clock jumps forward**                                      | `Date.now() - fetchedTime` is very large. Cache treated as stale. Triggers refresh. Correct behavior.                           |
| **Local source**                                             | `fetchFromLocalSource()` is called directly. No TTL check. No `.last-fetched`. Unchanged behavior.                              |
| **Multiple sources**                                         | Each source has its own cache directory. Each gets its own `.last-fetched`. No cross-contamination.                             |
| **giget ETag optimization**                                  | Even when TTL triggers a re-fetch, giget uses ETags internally. If content hasn't changed, download is fast (304 Not Modified). |

---

## Test Plan

### Feature 1: Version Check

**wizard-tabs.test.tsx:**

- Renders only current version when `latestVersion` is undefined.
- Renders only current version when `latestVersion` is the same as `version`.
- Renders update-available text when `latestVersion` is newer.
- Update-available text contains the correct version string.
- Update-available text uses warning color.

**hooks/init.test.ts** (new or extended):

- Reads version cache file and attaches `latestVersion` when newer version exists.
- Does not attach `latestVersion` when cache file doesn't exist.
- Does not attach `latestVersion` when cache file is invalid JSON.
- Does not attach `latestVersion` when cached version equals running version.
- Does not attach `latestVersion` when cached version is older.

### Feature 2: Source Staleness

**source-fetcher.test.ts** or **source-fetcher-refresh.test.ts:**

- Returns cached result when `.last-fetched` is within TTL.
- Re-fetches when `.last-fetched` is older than TTL.
- Re-fetches when `.last-fetched` file doesn't exist (migration case).
- Re-fetches when `.last-fetched` contains invalid date.
- Falls back to stale cache when re-fetch fails (network error).
- Writes `.last-fetched` after successful download.
- Does not check TTL when `forceRefresh: true`.
- Does not check TTL for local sources.
- Calls `clearGigetCache()` during TTL-triggered refresh.

---

## Files Changed Summary

| File                                          | Feature | Change                                                 |
| --------------------------------------------- | ------- | ------------------------------------------------------ |
| `package.json`                                | F1      | Add `warn-if-update-available.timeoutInDays: 1`        |
| `src/cli/hooks/init.ts`                       | F1      | Read version cache, attach `latestVersion`             |
| `src/cli/base-command.ts`                     | F1      | Add `latestVersion` getter                             |
| `src/cli/commands/init.tsx`                   | F1      | Pass `latestVersion` prop                              |
| `src/cli/commands/edit.tsx`                   | F1      | Pass `latestVersion` prop                              |
| `src/cli/components/wizard/wizard.tsx`        | F1      | Accept/forward `latestVersion` prop                    |
| `src/cli/components/wizard/wizard-layout.tsx` | F1      | Accept/forward `latestVersion` prop                    |
| `src/cli/components/wizard/wizard-tabs.tsx`   | F1      | Render update-available text                           |
| `src/cli/consts.ts`                           | F2      | Add `SOURCE_CACHE_TTL_MS` constant                     |
| `src/cli/lib/loading/source-fetcher.ts`       | F2      | Add TTL check, `isSourceStale()`, `writeLastFetched()` |

**Test files:**

| File                                                                             | Feature | Tests                      |
| -------------------------------------------------------------------------------- | ------- | -------------------------- |
| `src/cli/components/wizard/wizard-tabs.test.tsx`                                 | F1      | Update-available rendering |
| `src/cli/hooks/init.test.ts` (new or extended)                                   | F1      | Version cache reading      |
| `src/cli/lib/loading/source-fetcher.test.ts` or `source-fetcher-refresh.test.ts` | F2      | TTL staleness behavior     |
