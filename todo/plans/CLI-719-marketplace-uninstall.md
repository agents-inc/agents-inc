# CLI-719: Marketplace-Specific Uninstall

**Status:** Ready for Dev
**Priority:** M (Medium)
**Depends on:** Uninstall redesign (config-based removal logic) -- COMPLETED (current `uninstall.tsx` already uses config-based matching)
**Related:** Multi-Source UX 2.0 (Phase 1-6 complete), CLI-718 (source staleness)

---

## 1. Open Questions (All Resolved)

### Q1: Should `--source` accept a source name or a source URL?

**RESOLVED:** Option A — URL only. The `--source` flag takes a URL string (e.g., `github:acme-corp/skills`), the same format stored in `forkedFrom.source` metadata and `config.source`/`config.sources[].url`. This is unambiguous and matches directly against what's already stored.

### Q2: Should plugin-mode skills also be filtered by source?

**RESOLVED:** Phase 1: Local skills only. Plugin manifests don't store source metadata, so plugin-mode filtering is deferred. **Note:** Add plugin-mode source filtering in a future phase (requires adding source tracking to plugin manifests).

### Q3: What about agents -- should `--source` filter agent removal too?

**RESOLVED:** Phase 1: Skip agent removal when `--source` is set. Agents don't track source provenance. **Note:** Add agent source tracking and filtered removal in a future phase.

### Q4: Should `--source` be combinable with `--all`?

**RESOLVED:** Mutually exclusive. If both are passed, exit with validation error: "Cannot combine --source with --all."

---

## 2. Current State Analysis

### Uninstall Command (uninstall.tsx)

The current uninstall flow already has config-based source matching:

1. **Detection** (`detectUninstallTarget`, line 56): Scans for plugins, local skills, agents, `.claude/`, `.claude-src/`. Loads `ProjectSourceConfig` and collects all configured source URLs via `collectConfiguredSources()`.

2. **Source collection** (`collectConfiguredSources`, line 38-54): Returns a flat list of all configured source URLs -- the primary `config.source` plus all `config.sources[].url`. This is what skills are matched against.

3. **Skill matching** (`skillMatchesConfiguredSource`, line 168-174): Compares a skill's `forkedFrom.source` against the full list of configured sources via `configuredSources.includes(forkedFromSource)`.

4. **Removal** (`removeLocalFiles`, line 350-420): Iterates skill directories, reads `forkedFrom` metadata via `readForkedFromMetadata()`, removes skills where source matches OR where source is missing but config exists (legacy fallback).

5. **Dry-run** (`dryRunLocalRemoval`, line 422-456): Same matching logic, but logs instead of removing.

### How Skills Track Their Source

Each installed skill has a `metadata.yaml` with a `forkedFrom` block (from `skill-metadata.ts:26-35`):

```yaml
forkedFrom:
  skillId: web-framework-react
  contentHash: abc1234
  date: "2026-01-01"
  source: "github:agents-inc/skills" # <-- this is what we match against
```

The `source` field is written by `injectForkedFromMetadata()` (line 312) during skill installation. It stores the source URL string that was used at install time.

### Config Structure (config.ts:38-51)

```yaml
# .claude-src/config.yaml
source: "github:agents-inc/skills" # primary source URL
sources: # extra sources
  - name: acme
    url: "github:acme-corp/skills"
    description: "Acme Corp internal skills"
  - name: team
    url: "github:myteam/shared-skills"
```

### What Does NOT Track Source

- **Plugins:** `plugin.json` manifests have no `source` field. Plugin names include `@marketplace` suffix but this is not a reliable source identifier.
- **Compiled agents:** `.claude/agents/*.md` files are compiled output with no provenance metadata about which source they came from.

### Existing Tests (uninstall.test.ts)

The test file already covers:

- Skills with `forkedFrom.source` matching a configured source (line 259)
- Skills from extra sources (line 346)
- Legacy skills without source field (line 372)
- User-created skills preservation (line 274)
- Combined removal scenarios (line 707)
- Dry-run mode (line 485)

---

## 3. Design

### User-Facing Behavior

```bash
# Remove only skills installed from a specific source
agentsinc uninstall --source github:acme-corp/skills --yes

# Dry-run to preview what would be removed
agentsinc uninstall --source github:acme-corp/skills --dry-run

# Interactive confirmation (default)
agentsinc uninstall --source github:acme-corp/skills
```

### Output

```
Agents Inc. Uninstall (source: github:acme-corp/skills)

The following will be removed:

  Skills from github:acme-corp/skills:
    .claude/skills/web-tooling-acme-lint/ (matching source)
    .claude/skills/web-tooling-acme-format/ (matching source)

  Skipping 3 skills from other sources.
  Agent removal skipped (not yet supported for source-specific uninstall).
  Plugin removal skipped (not yet supported for source-specific uninstall).

Are you sure you want to uninstall? (y/N)

  Uninstalled skill 'web-tooling-acme-lint'
  Uninstalled skill 'web-tooling-acme-format'
  Removed 2 skills from source "github:acme-corp/skills"

Agents Inc. source-specific uninstall complete.
```

### Flag Definition

```typescript
static flags = {
  ...BaseCommand.baseFlags,
  yes: Flags.boolean({ ... }),       // existing
  all: Flags.boolean({ ... }),       // existing
  source: Flags.string({
    char: "s",
    description: "Only remove skills from this source (name or URL)",
  }),
};
```

### Matching Logic

When `--source` is set:

1. **Validate the source URL:**
   - The `--source` value is treated as a URL directly (same format as `config.source` / `config.sources[].url`)
   - Validate it exists in the config (either as primary `config.source` or an extra `config.sources[].url`)
   - If not found in config, exit with error: "Source 'X' is not configured. Configured sources: [list]"

2. **Filter skill matching:**
   - Instead of matching against ALL configured sources, match only against the single source URL
   - The existing `skillMatchesConfiguredSource()` accepts a `configuredSources: string[]` -- pass a single-element array with the target source URL

3. **Skip agents and plugins:**
   - When `--source` is set, do not remove agents (not yet supported — future phase)
   - When `--source` is set, do not remove plugins (not yet supported — future phase)

4. **Skip `.claude-src/` removal:**
   - Mutually exclusive with `--all`

5. **Skip `.claude/` empty cleanup:**
   - After source-specific removal, the skills directory may still have skills from other sources. Do not clean up `.claude/` or `.claude/skills/` unless they are truly empty.

### Confirmation UI

The `UninstallConfirm` component (line 106) needs modification to show source-specific context:

- Header: "Uninstall (source: acme)" instead of just "Uninstall"
- List only the skills that match the source
- Show count of skipped skills from other sources

---

## 4. Step-by-Step Implementation Plan

### Step 1: Add `--source` flag (uninstall.tsx:188-199)

Add the `source` flag to `static flags`:

```typescript
source: Flags.string({
  char: "s",
  description: "Only remove skills from this source (name or URL)",
}),
```

Add a new example (line 181-186):

```typescript
"<%= config.bin %> <%= command.id %> --source github:acme-corp/skills --yes",
```

### Step 2: Validate source URL against config (uninstall.tsx, new module-level function)

Add a function near the existing `collectConfiguredSources()` (line 38):

```typescript
function isConfiguredSource(
  sourceUrl: string,
  configuredSources: string[]
): boolean
```

Logic: Check if `sourceUrl` exists in the `configuredSources` array (same list returned by `collectConfiguredSources()`). Simple `includes()` check.

### Step 3: Add flag validation in run() (uninstall.tsx:201, inside the run method)

After parsing flags, before detection:

```typescript
if (flags.source && flags.all) {
  this.error(
    "Cannot combine --source with --all. Use --source to remove skills from a specific source, or --all to remove everything.",
    { exit: EXIT_CODES.INVALID_ARGS }
  )
}
```

If `--source` is set and config is loaded, validate:

```typescript
if (flags.source) {
  if (!isConfiguredSource(flags.source, target.configuredSources)) {
    const allSources = target.configuredSources.join(", ")
    this.error(
      `Source "${flags.source}" is not configured. Configured sources: ${allSources || "(none)"}`,
      { exit: EXIT_CODES.INVALID_ARGS }
    )
  }
}
```

### Step 4: Thread targetSource to removal logic

Modify the `removeLocalFiles` and `dryRunLocalRemoval` methods to accept an optional `targetSourceUrl` parameter. When set, use `[targetSourceUrl]` as the `configuredSources` filter instead of the full `target.configuredSources` list.

**removeLocalFiles signature change:**

```typescript
private async removeLocalFiles(
  target: UninstallTarget,
  removeAll: boolean,
  targetSourceUrl?: string,
): Promise<void>
```

Inside this method:

- Line 363: Replace `target.configuredSources` with `targetSourceUrl ? [targetSourceUrl] : target.configuredSources`
- When `targetSourceUrl` is set, skip agent removal (line 390-405) and log a note
- When `targetSourceUrl` is set, skip plugin removal and log a note
- When `targetSourceUrl` is set, skip `.claude-src/` removal (already handled by mutual exclusivity with `--all`)

**dryRunLocalRemoval signature change:**

Same pattern -- accept `targetSourceUrl`, filter accordingly, log dry-run notes for skipped agents/plugins.

### Step 5: Modify the hasAnythingToRemove check (uninstall.tsx:216-220)

When `--source` is set, the check should consider that plugins and agents won't be removed:

```typescript
const hasAnythingToRemove = flags.source
  ? target.hasLocalSkills // only skills are candidates when --source is set
  : target.hasPlugins ||
    target.hasLocalSkills ||
    target.hasLocalAgents ||
    (flags.all && target.hasClaudeSrcDir)
```

### Step 6: Update the confirmation UI (UninstallConfirm component, line 106)

When `targetSourceUrl` is set:

- Show source-specific header: "Skills from github:acme-corp/skills will be removed:"
- Only list skill directories whose `forkedFrom.source` matches the target (this requires pre-scanning skills before showing the confirm UI, or adjusting the message to be generic)
- Add lines for skipped removals: "Agent removal skipped" and "Plugin removal skipped"

For simplicity, keep the existing `UninstallConfirm` structure but pass a `sourceUrl` prop to conditionally adjust the header and messaging.

### Step 7: Update the summary message (uninstall.tsx:333-337)

When `--source` is set, change the completion message:

```typescript
this.log(`Removed ${count} skills from source "${flags.source}".`)
```

instead of the generic "has been uninstalled" message.

### Step 8: Update examples and description (uninstall.tsx:177-186)

Update the `static description` to mention `--source` and add the example.

---

## 5. Edge Cases

### Source not in config

If `--source` specifies a source that is not in `config.yaml` (neither primary nor extra), exit with `EXIT_CODES.INVALID_ARGS` and list the available configured sources.

### No config.yaml at all

If no project config exists and `--source` is set, all configured sources are empty. The resolution fails and exits with: "No project configuration found. Run 'agentsinc init' first."

### No skills match the specified source

If `--source acme` is valid but no installed skills have `forkedFrom.source` matching the resolved URL:

```
No skills found from source "acme" (github:acme-corp/skills).
```

This is not an error -- exit cleanly (like the current "Nothing to uninstall" path).

### Legacy skills without `forkedFrom.source`

Legacy skills (pre-multi-source) have `forkedFrom` but no `source` field. When `--source` is set, these should NOT be removed -- source-specific uninstall requires an explicit match. The existing legacy fallback (`!forkedFrom.source && target.config !== null`) should only apply when no `--source` flag is specified.

### Skills from the primary source

When `--source github:agents-inc/skills` is specified (the primary source), match only skills whose `forkedFrom.source` is `"github:agents-inc/skills"`. This correctly removes primary-source skills while preserving extra-source skills.

### User-created skills

User-created skills (no `forkedFrom` metadata) are always preserved, same as current behavior. No change needed.

### `.claude/skills/` cleanup after source-specific removal

After removing skills from one source, other skills may remain. The empty-directory cleanup logic should still run -- only clean up `.claude/skills/` and `.claude/` if they are truly empty after the selective removal.

### Plugins with `--source`

Plugins are not removed when `--source` is specified. Log: "Plugin removal skipped (use 'agentsinc uninstall' without --source to remove plugins)."

---

## 6. Test Plan

### New unit tests

**File:** `src/cli/lib/__tests__/commands/uninstall.test.ts`

New `describe("--source flag")` block:

| Test                                                                   | What it verifies                                         |
| ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `should accept --source flag`                                          | Flag is parsed without error                             |
| `should accept -s shorthand for source`                                | Short flag works                                         |
| `should reject --source combined with --all`                           | Error: mutually exclusive                                |
| `should remove only skills from specified source URL`                  | Skills matched by URL removed, other sources preserved   |
| `should reject unknown source URL`                                     | Error lists configured sources                           |
| `should skip agent removal when --source is set`                       | Agents directory untouched                               |
| `should skip plugin removal when --source is set`                      | Plugins untouched                                        |
| `should not remove legacy skills without source field`                 | Legacy skills preserved during source-specific uninstall |
| `should show source-specific message on completion`                    | Output mentions source URL                               |
| `should preview source-specific removal in dry-run`                    | `[dry-run]` output filtered by source                    |
| `should show nothing to uninstall when no skills match source`         | Clean exit with informative message                      |
| `should preserve user-created skills during source-specific uninstall` | User skills untouched                                    |
| `should clean up empty .claude/skills/ after source-specific removal`  | Directory removed if empty                               |
| `should keep .claude/skills/ if other source skills remain`            | Directory preserved when other skills exist              |

### Existing tests must continue passing

All 25 existing uninstall tests must pass unchanged. The `--source` flag is optional -- omitting it preserves the current "remove all configured sources" behavior.

### Test approach

Follow the existing test patterns:

- Use `createProjectConfig()` with `extraSources` to set up multi-source configs
- Use `createCLISkill(skillsDir, name, source)` with different source URLs
- Use `createUserSkill()` for user-created skills
- Assert directory existence/absence and stdout content

---

## 7. Files Changed Summary

### Modified files

| File                                               | Change                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/cli/commands/uninstall.tsx`                   | Add `--source` flag, `resolveTargetSource()` function, flag validation, thread `targetSource` to removal/dry-run methods, update UI and messages |
| `src/cli/lib/__tests__/commands/uninstall.test.ts` | Add 14 new test cases for `--source` flag behavior                                                                                               |

### No new files

All changes fit within the existing command and test files. No new utility modules, no new abstractions.

### Estimated scope

- **Modified code:** ~60-80 lines in `uninstall.tsx` (flag, validation, resolution, filtering, messages)
- **Test code:** ~150-200 lines of new tests
- **Complexity:** Low -- the core matching infrastructure already exists (`skillMatchesConfiguredSource`, `readForkedFromMetadata`, `collectConfiguredSources`). The main addition is narrowing the match to a single source URL instead of all configured sources.
