# Research: Auto-Freshness Features

## Feature 1: CLI Version Check in Wizard Header

### Current State

**Package identity:**

- Package name: `@agents-inc/cli` (from `package.json:2`)
- Current version: `0.35.0` (from `package.json:3`)
- Published to npm: `https://registry.npmjs.org/@agents-inc/cli`
- GitHub repo: `https://github.com/agents-inc/cli`

**Where version is currently rendered:**

The version flows through this path:

1. **Command level** (`src/cli/commands/init.tsx:114`, `src/cli/commands/edit.tsx:114`): `this.config.version` (oclif's built-in version from `package.json`) is passed as a prop to the `<Wizard>` component.

2. **Wizard component** (`src/cli/components/wizard/wizard.tsx:256`): Passes `version` prop down to `<WizardLayout>`.

3. **WizardLayout** (`src/cli/components/wizard/wizard-layout.tsx:106-112`): Passes `version` to `<WizardTabs>`.

4. **WizardTabs** (`src/cli/components/wizard/wizard-tabs.tsx:101-103`): Renders the version in the far-right of the tab bar:
   ```tsx
   <Box flexGrow={1} justifyContent="flex-end">
     <Text dimColor>{`v${version}`}</Text>
   </Box>
   ```

**Existing update mechanism -- `@oclif/plugin-warn-if-update-available`:**

The project already has `@oclif/plugin-warn-if-update-available` v3.1.55 installed and configured:

- Listed in `package.json:56` under `oclif.plugins`
- Listed in `package.json:100` under `dependencies`

This plugin works as follows (from `node_modules/@oclif/plugin-warn-if-update-available/lib/hooks/init/check-update.js`):

1. **On every CLI init hook**, it checks a cached version file at `~/Library/Caches/agents-inc/version` (macOS) or `~/.cache/@agents-inc/cli/version` (Linux).

2. **If the cache file is stale** (default: 60 days `timeoutInDays`), it spawns a **background child process** (`get-version.js`) that:
   - Fetches `https://registry.npmjs.org/@agents-inc%2fcli` (the full npm registry endpoint)
   - Writes the `dist-tags` to the version cache file
   - Exits immediately (detached, stdio ignored)

3. **If the cached version is newer** than the running version, it displays a warning via `this.warn()` after the command completes.

4. The current cached content is: `{"latest":"0.32.1","current":"0.32.1"}` -- this appears stale relative to v0.35.0, suggesting the cache hasn't refreshed recently (possibly due to the 60-day timeout).

**Key insight:** The oclif plugin already handles the background npm check and caching. But it only shows a plain `this.warn()` message after command execution -- not in the wizard header during the interactive UI.

### Proposed Approach: CLI Version Check

#### Option A: Read oclif's existing cache file (Recommended)

Since `@oclif/plugin-warn-if-update-available` already maintains a version cache at `{config.cacheDir}/version`, we can simply read this file and compare versions. No need to duplicate the npm fetch logic.

**Implementation flow:**

1. In the oclif init hook or at command startup, read `{config.cacheDir}/version`.
2. Parse the JSON (`{"latest": "0.35.0", "current": "0.35.0"}`).
3. Compare `latest` against `config.version` using semver comparison.
4. If newer version exists, pass the latest version info to the Wizard component.
5. The WizardTabs component renders "v0.35.0 -> v0.36.0 available" instead of just "v0.35.0".

**Pros:**

- Zero additional npm requests -- reuses existing cache
- No new dependencies needed
- Background refresh already handled by the oclif plugin
- Minimal code changes

**Cons:**

- Depends on the oclif plugin's cache freshness (default 60-day timeout, configurable via env vars)
- If the plugin hasn't run recently, cache might be stale
- Couples to the oclif plugin's internal cache format (but it's simple JSON)

#### Option B: Independent background check

Implement a custom version check that:

1. Spawns a background process or uses `fetch()` with `AbortController` timeout
2. Checks `https://registry.npmjs.org/@agents-inc/cli/latest` (returns `{"name": "@agents-inc/cli", "version": "0.35.0", ...}`)
3. Caches the result locally (e.g., `~/.cache/agents-inc/version-check.json` with a timestamp)
4. Passes result to the wizard via Zustand store or React state

**Pros:**

- Independent of oclif plugin internals
- Can set a shorter TTL (e.g., 1 hour instead of 60 days)
- Full control over behavior

**Cons:**

- Duplicates logic that already exists
- Additional network request (even if lightweight)
- More code to maintain

#### Recommendation: Hybrid -- Option A with a shorter TTL trigger

1. **Read** the oclif plugin's existing cache file at startup.
2. **If the cache is older than 1 hour**, trigger a background refresh (the oclif plugin's `timeoutInDays` can be configured via the `AGENTSINC_NEW_VERSION_CHECK_FREQ` and `AGENTSINC_NEW_VERSION_CHECK_FREQ_UNIT` env vars, or by adding `warn-if-update-available.timeoutInDays` to the oclif config in `package.json`).
3. **Pass the latest version** to the Wizard component as a new prop.
4. **Render in WizardTabs** conditionally: show update text only when a newer version is detected.

### Files That Would Need to Change

| File                                             | Change                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                   | Add `warn-if-update-available` config to reduce `timeoutInDays` (e.g., to 1 day or configure via frequency/frequencyUnit) |
| `src/cli/hooks/init.ts`                          | Read the version cache file and attach `latestVersion` to the oclif config object                                         |
| `src/cli/base-command.ts`                        | Add a getter for `latestVersion` from the config (similar to `sourceConfig`)                                              |
| `src/cli/commands/init.tsx`                      | Pass `latestVersion` prop to `<Wizard>`                                                                                   |
| `src/cli/commands/edit.tsx`                      | Pass `latestVersion` prop to `<Wizard>`                                                                                   |
| `src/cli/components/wizard/wizard.tsx`           | Accept and forward `latestVersion` prop                                                                                   |
| `src/cli/components/wizard/wizard-layout.tsx`    | Forward `latestVersion` to `<WizardTabs>`                                                                                 |
| `src/cli/components/wizard/wizard-tabs.tsx`      | Render update-available text next to version                                                                              |
| `src/cli/components/wizard/wizard-tabs.test.tsx` | Add test for update-available rendering                                                                                   |

### Detailed Component Changes

#### `wizard-tabs.tsx` -- Version Display

Current (line 101-103):

```tsx
<Box flexGrow={1} justifyContent="flex-end">
  <Text dimColor>{`v${version}`}</Text>
</Box>
```

Proposed:

```tsx
<Box flexGrow={1} justifyContent="flex-end" columnGap={1}>
  <Text dimColor>{`v${version}`}</Text>
  {latestVersion && (
    <Text color={CLI_COLORS.WARNING}>{`-> v${latestVersion} available`}</Text>
  )}
</Box>
```

#### `hooks/init.ts` -- Read cached version

Add logic to read `{config.cacheDir}/version` and compare:

```typescript
// After existing hook logic...
try {
  const versionFile = path.join(options.config.cacheDir, "version")
  const content = await readFile(versionFile, "utf-8")
  const distTags = JSON.parse(content)
  const latest = distTags.latest
  if (latest && latest !== options.config.version) {
    // semver comparison
    if (
      latest.localeCompare(options.config.version, undefined, {
        numeric: true,
      }) > 0
    ) {
      ;(options.config as unknown as ConfigWithVersionCheck).latestVersion =
        latest
    }
  }
} catch {
  // Cache file doesn't exist yet or is invalid -- ignore
}
```

### Alternative: Zustand-based Background Check in Wizard

Instead of reading the cache in the oclif hook (synchronous, before wizard renders), we could use a React `useEffect` inside the Wizard to check asynchronously:

```tsx
// In wizard.tsx or a new hook
const [latestVersion, setLatestVersion] = useState<string | null>(null)

useEffect(() => {
  const checkVersion = async () => {
    try {
      const versionFile = path.join(cacheDir, "version")
      const data = JSON.parse(await readFile(versionFile, "utf-8"))
      if (data.latest && semverGreaterThan(data.latest, currentVersion)) {
        setLatestVersion(data.latest)
      }
    } catch {
      // ignore
    }
  }
  checkVersion()
}, [])
```

This approach would make the version text "appear" after a brief moment (when the file read completes), which is acceptable since it's non-blocking. However, reading a local file is fast enough that it would appear nearly instantly, so the oclif hook approach is simpler and more consistent with existing patterns.

### Edge Cases and Considerations

1. **First-ever run:** The version cache file won't exist yet. The oclif plugin creates it on first run via the background process. The UI should just show the current version without update text.

2. **Offline/air-gapped:** The background npm check will fail silently. The cache will remain stale. No update text shown (which is correct).

3. **Pre-release versions:** The oclif plugin already handles this -- it skips the check if `config.version` contains a hyphen (e.g., `0.36.0-beta.1`).

4. **npm registry down:** The background child process handles this gracefully (it catches errors and exits).

5. **Race condition on first run:** If the version cache doesn't exist when the hook reads it, but the oclif plugin creates it moments later (via background process), the wizard won't show update info. This is fine -- next run will pick it up.

6. **Cache staleness:** With the default 60-day timeout, users may not see updates for a long time. Recommend reducing to 1 day or configuring `frequency: 60, frequencyUnit: "minutes"` in `package.json`.

7. **User experience:** The text should be subtle (dimColor or warning color) and informative, not alarming. Avoid phrasing like "outdated" -- use "available" instead.

8. **Suppression:** The oclif plugin respects `AGENTSINC_SKIP_NEW_VERSION_CHECK=true`. The same env var should suppress the wizard header text.

---

## Feature 2: Source Staleness Check (TTL-based Auto-Refresh)

### Current State

**Source caching mechanism** (`src/cli/lib/loading/source-fetcher.ts`):

1. Remote sources are fetched via `giget` (`downloadTemplate()`) to a cache directory at `~/.cache/agents-inc/sources/{sanitized-name}-{hash}`.

2. **Cache hit logic** (line 161-168): If `forceRefresh` is false AND the cache directory exists, it returns the cached path immediately. There is **no TTL check** -- the cache is used indefinitely until the user passes `--refresh`.

3. **Force refresh** (`--refresh` flag): Clears the giget tarball/ETag cache and re-downloads.

4. **giget's own caching:** giget also maintains its own tarball cache at `~/.cache/giget/{provider}/{template}` with ETags. The `clearGigetCache()` function (line 142-150) removes this cache when force-refreshing.

5. **No `.last-fetched` timestamp exists** anywhere in the codebase (confirmed via grep).

### Proposed Approach: TTL-based Auto-Refresh

#### Where to Add the TTL Check

In `src/cli/lib/loading/source-fetcher.ts`, inside `fetchFromRemoteSource()` (line 152), before the cache hit check:

```typescript
async function fetchFromRemoteSource(
  source: string,
  options: FetchOptions
): Promise<FetchResult> {
  const { forceRefresh = false, subdir } = options
  const cacheDir = getCacheDir(source)
  const fullSource = subdir ? `${source}/${subdir}` : source

  // NEW: TTL-based staleness check
  if (!forceRefresh && (await directoryExists(cacheDir))) {
    const lastFetchedFile = path.join(cacheDir, ".last-fetched")
    const isStale = await isSourceStale(lastFetchedFile)

    if (!isStale) {
      verbose(`Using cached source: ${cacheDir}`)
      return { path: cacheDir, fromCache: true, source: fullSource }
    }

    verbose(`Cache is stale, re-fetching: ${fullSource}`)
    // Fall through to re-fetch below
  }

  // ... existing fetch logic ...

  // After successful fetch, write timestamp
  await writeLastFetched(path.join(cacheDir, ".last-fetched"))

  return { path: result.dir, fromCache: false, source: fullSource }
}
```

#### `.last-fetched` File Format

Simple: just a file containing an ISO 8601 timestamp.

```
2026-02-18T15:30:00.000Z
```

**Why not use file mtime?** File system timestamps can be unreliable (some operations preserve original mtimes). An explicit timestamp file is more predictable.

#### TTL Value

Recommended: **1 hour (3600000 ms)**.

Rationale:

- Skills don't change extremely frequently
- Users typically do `init` or `edit` sessions spanning minutes, not hours
- 1 hour strikes a balance between freshness and avoiding unnecessary network requests
- The `--refresh` flag remains available for force-refresh

Define as a named constant in `consts.ts`:

```typescript
/** How long cached remote sources remain fresh before auto-refreshing (milliseconds) */
export const SOURCE_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
```

#### Interaction with Existing Mechanisms

| Mechanism            | Behavior                              | After TTL addition                  |
| -------------------- | ------------------------------------- | ----------------------------------- |
| `--refresh` flag     | Clears giget cache + re-downloads     | Unchanged -- always force-refreshes |
| `forceRefresh: true` | Bypasses cache entirely               | Unchanged                           |
| No flag, fresh cache | Returns cached path                   | Returns cached path (within TTL)    |
| No flag, stale cache | **Returns cached path** (current bug) | **Auto-refreshes** (new behavior)   |

The `clearGigetCache()` function should also be called during TTL-triggered refresh, just as it is during `--refresh`.

### Files That Would Need to Change

| File                                         | Change                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/cli/consts.ts`                          | Add `SOURCE_CACHE_TTL_MS` constant                                                      |
| `src/cli/lib/loading/source-fetcher.ts`      | Add `isSourceStale()`, `writeLastFetched()` functions; modify `fetchFromRemoteSource()` |
| `src/cli/lib/loading/source-fetcher.test.ts` | Add tests for TTL behavior                                                              |

### Edge Cases

1. **First fetch:** No `.last-fetched` file exists. The existing logic handles this -- if the cache directory doesn't exist, it always fetches.

2. **Failed re-fetch:** If the network is down during a TTL-triggered refresh, the function should fall back to the existing cache rather than failing. This is a key difference from `--refresh` (which should fail if the network is down).

3. **giget ETag optimization:** Even when we trigger a re-fetch, giget uses ETags to avoid downloading unchanged content. So a "stale TTL" re-fetch may still be fast if content hasn't changed.

4. **Clock skew:** If the system clock jumps backward, the `.last-fetched` timestamp might appear "in the future." The staleness check should handle this gracefully (treat future timestamps as fresh, or simply use `Date.now() - fetchedTime > TTL`).

5. **Multiple sources:** Each source has its own cache directory, so each gets its own `.last-fetched` file. No cross-contamination.

---

## Rough Implementation Plan

### Phase 1: CLI Version Check (Estimated: Small)

1. Configure `@oclif/plugin-warn-if-update-available` in `package.json` to check more frequently:

   ```json
   "warn-if-update-available": {
     "timeoutInDays": 1,
     "message": "@agents-inc/cli update available: v<%= config.version %> -> v<%= latest %>"
   }
   ```

2. Add version cache reading to `hooks/init.ts` (read `{cacheDir}/version`, compare with semver).

3. Thread `latestVersion` through: BaseCommand -> init/edit commands -> Wizard -> WizardLayout -> WizardTabs.

4. Update WizardTabs rendering to conditionally show update text.

5. Add tests for the new rendering in `wizard-tabs.test.tsx`.

### Phase 2: Source Staleness (Estimated: Small)

1. Add `SOURCE_CACHE_TTL_MS` constant to `consts.ts`.

2. Add `isSourceStale()` and `writeLastFetched()` helpers to `source-fetcher.ts`.

3. Modify `fetchFromRemoteSource()` to check TTL before returning cached path.

4. Add fallback-to-cache logic if TTL-triggered fetch fails.

5. Add tests for TTL behavior in `source-fetcher.test.ts`.

### Dependencies Between Features

These two features are **independent** and can be implemented in either order or in parallel. Feature 1 is purely UI/display. Feature 2 is purely data-fetching logic. They share no code paths.
