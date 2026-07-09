---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/configuration/config-merger.ts
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-06
reporting_agent: web-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: compound keys in config-merger.ts; tombstone pruning in local-installer.ts
---

## What Was Wrong

Two related issues in the config pipeline caused stale agent files after scope toggling:

1. **config-merger.ts**: The agent merge block used simple `name` as the `indexBy` key, while the skill merge block (added later) used a compound key (`id` vs `id:excluded`). When the wizard produced both an active entry (`scope: "project"`) and an excluded tombstone entry (`scope: "global", excluded: true`) for the same agent name, `indexBy` kept only the last entry, silently dropping the active one.

2. **local-installer.ts**: `writeScopedConfigs` had no logic to process excluded tombstone entries from the project split config. Even after `mergeGlobalConfigs`, agents/skills that had been toggled from global to project scope remained in the effective global config because nothing pruned them based on the tombstone signals.

## Fix Applied

1. Changed agent merge in `config-merger.ts` to use compound keys matching the existing skill pattern: `(a.excluded ? "${a.name}:excluded" : a.name)`.

2. Added tombstone pruning in `local-installer.ts` after computing `effectiveGlobalConfig`: filters out agents/skills whose names/IDs appear as excluded entries in `projectSplitConfig`.

3. Updated E2E test from `it.fails` to `it` since the bug is now fixed.

## Proposed Standard

When adding merge/dedup logic for config entries that have an `excluded` flag, always use compound keys that distinguish active from excluded entries. Document this in `.ai-docs/standards/clean-code-standards.md` under a "Config merging" section: "Agent and skill config entries use compound keys (`name` or `id` + `:excluded` suffix) to allow both an active entry and an excluded tombstone for the same identifier to coexist."
