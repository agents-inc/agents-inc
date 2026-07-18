---
type: anti-pattern
severity: high
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/components/wizard/wizard.tsx
  - src/cli/lib/configuration/config-merger.ts
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/reference/concepts/tombstone-pattern.md
date: 2026-07-18
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: "populateFromSkillIds now records the specific skipped skill ids (unresolvableSkillIds), threaded through WizardResultV2 -> buildAndMergeConfig -> mergeWithExistingConfig -> mergeConfigs, which exempts those ids from the authoritativeScope drop."
---

## What Was Wrong

`populateFromSkillIds` (wizard-store) resolves each saved skill id against the currently-loaded
source matrix via `resolveSkillForPopulation`. When a skill id is not in the loaded matrix (wrong
`--source`, stale/different cache, an upstream rename/removal, or an E2E fixture source that does not
define every skill in a pre-existing `config.ts`), it was tracked only as an anonymous `skippedCount`
and dropped from the wizard's live state. The _identity_ of the skipped skills was discarded.

Before D-233's `authoritativeScope` work, `mergeConfigs` union-preserved any existing config entry
whose id was absent from the new wizard result, so an "unresolvable this session" skill still survived
on disk (invisible but harmless). After D-233, a project-context edit (`authoritativeScope: "owned"`)
or global edit (`"all"`) treats a within-authority entry absent from the new result as a deliberate
deselection and drops it. This conflated two different situations:

1. "The wizard showed this skill and the user chose not to select it" — a genuine deselection that
   D-233 correctly drops.
2. "The wizard never knew this skill existed because the loaded source does not define it" — the
   wizard could not represent it, so its absence is a resolution gap, not a choice. Dropping it is
   silent data loss.

Because only a count was retained, the merge layer had no way to distinguish (2) from (1).

## Fix Applied

- `populateFromSkillIds` now collects the actual skipped ids into `unresolvableSkillIds` and exposes
  them as wizard-store state (default `[]`, reset in `createInitialState`).
- `WizardResultV2` carries `unresolvableSkillIds`; `handleComplete` populates it from the store.
- `buildAndMergeConfig` reads `wizardResult.unresolvableSkillIds` and threads it through
  `mergeWithExistingConfig` (`MergeContext`) into `mergeConfigs` (`MergeOptions`).
- `mergeConfigs` guards the authoritative drop with `&& !unresolvableSkillIds.has(existing.id)`: an
  existing entry whose id could not be resolved this session is always preserved, regardless of
  `authoritativeScope`. This is a single, narrow additional preserve-case; genuine deselections
  (resolvable, shown-but-unselected) still drop, so the original D-233 bug is not reopened.

Agent side was checked for symmetry: agents are hydrated directly from saved config
(`hydrateWizardStore`) and are never matrix-resolved during hydration, so no agent is silently
skipped and there is no equivalent "unresolvable agent" set to thread. The fix is correctly
skills-only.

## Proposed Standard

When a value that drives a downstream drop/keep decision is filtered out, retain the _identity_ of
what was filtered, not just a count. A bare `skippedCount++` erases the information a later authority
layer needs to distinguish "user removed it" from "we could not represent it." Any place that skips
items during hydration/restore and later makes an authoritative removal decision must carry the set
of skipped identities forward.

Suggested home: add a short rule to `.ai-docs/reference/concepts/tombstone-pattern.md` (or the
D-233 authoritativeScope notes) stating: "Authoritative removal (`authoritativeScope`) may only drop
entries the wizard could actually represent this session. Any id the wizard could not resolve from
the loaded source must be preserved — track skipped ids explicitly, never as an anonymous count."
