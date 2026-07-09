---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/commands.md
  - src/cli/commands/search.ts
  - src/cli/commands/doctor.ts
  - src/cli/commands/build/
  - src/cli/lib/feature-flags.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: commands.md corrected (build stack removed, search/doctor flags fixed, Feature-Gated Commands section added, last_validated bumped)
---

## What Was Wrong

`commands.md` had three categories of drift vs. actual code in `src/cli/commands/`:

1. **Dead command documented.** `build stack` had a full documented entry but `src/cli/commands/build/stack.tsx` does not exist. Only `marketplace.ts` and `plugins.ts` live in `build/`.
2. **Wrong file extension + fabricated flags on `search`.** Docs claimed `search.tsx` with `--interactive`/`--category`/`--refresh`/`--json` flags and an optional `query` arg. Reality: `search.ts`, `static flags = {}`, `static baseFlags = {} as ...` (overrides BaseCommand `--source`), `query` is `required: true`.
3. **Fabricated flags on `doctor`.** Docs claimed `--source`/`--verbose` flags. Reality: `static flags = {}`, `static baseFlags = {}` (overrides parent `--source`), and `setVerbose(true)` is called unconditionally inside `run()`.
4. **Feature-gated commands not labeled.** `new skill`, `new agent`, `new marketplace` are all gated behind `FEATURE_FLAGS.NEW_SKILL_COMMAND` / `NEW_AGENT_COMMAND` / `NEW_MARKETPLACE_COMMAND`, all currently `false` in `src/cli/lib/feature-flags.ts`. Docs did not mention this gate, so an agent reading the docs would invoke a disabled command and hit an error.

## Fix Applied

Updated `commands.md`:

- Removed `build stack` entry from the index table and deleted the full `build stack` section.
- Replaced the `search` section with accurate args/flags (zero flags, `query` required) and noted the `baseFlags = {}` override.
- Replaced the `doctor` flags table with a single-line note that both `flags` and `baseFlags` are `{}` and that `setVerbose(true)` is unconditional.
- Added a **Feature-Gated Commands** section listing the three `new`-family commands with their flag names and current values, plus an inline "FEATURE-GATED" tag in the index table.
- Bumped `last_validated` to 2026-04-21.
- Updated `DOCUMENTATION_MAP.md` with a validation comment listing the drift found.

## Proposed Standard

Add to `.ai-docs/standards/documentation-bible.md` under a "Command reference docs" section:

1. **Verify `static flags` and `static baseFlags` before documenting command flags.** If either is `{}`, the command has no flags of that kind. Do not document inherited `--source` if `baseFlags = {}`.
2. **Glob `src/cli/commands/**/\*.{ts,tsx}` at every validation cycle\*\* and diff against the index table. Flag any row whose file does not exist and any command file not in the table.
3. **Any command whose `run()` begins with `if (!FEATURE_FLAGS.X)` must carry a `Feature flag:` line in its section.** Cross-reference the current flag value in `src/cli/lib/feature-flags.ts`.

These three checks would have caught all four drift items in this session in under 30 seconds.
