---
type: standard-gap
severity: low
affected_files:
  - knip.jsonc
  - packages/cli/src/cli/commands/uninstall.tsx
  - packages/cli/src/cli/commands/init.tsx
  - packages/cli/src/cli/commands/edit.tsx
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-20
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: partial
partial_note: >-
  The instances are fixed: uninstall.tsx's, init.tsx's showDashboard, DashboardCommand,
  getDashboardData and dashboardCountLines, and edit.tsx's detectConfigChanges, ConfigChanges,
  migratePluginSkillScopes and PluginScopeMigrationResult are no longer exported, and the census
  lists no named command export. Nothing in knip.jsonc or any brief makes the census run.
---

## What Was Wrong

`knip.jsonc` names `src/cli/commands/**/*.{ts,tsx}` and `src/cli/hooks/**/*.ts` as entry files for
`packages/cli`. knip does not report an entry file's exports unless `--include-entry-exports` is
given. So the knip report a REPO-44 lane is handed can never list an unused export in a command
file, and "Unused exports knip lists for the file" comes back empty for every command lane however
dead its exports are.

`uninstall.tsx` exported `UninstallTarget` under `/** @internal Exported for testing */`. Nothing
imported it:

```
git show HEAD:packages/cli/src/cli/commands/uninstall.tsx | grep -n "export type UninstallTarget"
git grep -n -w UninstallTarget HEAD -- src e2e scripts | grep -v commands/uninstall.tsx | wc -l   # 0
```

Census by the command below, run from the repo root; confirm each hit with `grep -rlw` over
`src e2e scripts`. The lines its `grep -v` drops are oclif and hook default exports, which oclif
loads by convention, and which it reports only where no spec imports them.

```
npx knip --workspace packages/cli --include exports,types --include-entry-exports --no-progress \
  | grep -E 'src/cli/(commands|hooks)/' | grep -v '^default '
```

## Fix Applied

`export` and the false `@internal Exported for testing` docblock removed from `UninstallTarget`,
`getCliInstalledPluginKeys` and `uninstallPlugins`.

## Proposed Standard

A brief that hands a lane "the unused exports knip lists" for a command or hook file carries the
`--include-entry-exports` invocation above instead of the default report. Turning
`includeEntryExports` on in `knip.jsonc` is not proposed: every oclif default export no spec
imports would then read as dead, which is what `packages/cli/CLAUDE.md` → Code Conventions forbids
anyone to "fix". Checked against `CLAUDE.md`: no conflict. "NEVER export constants only used within
the same file" is the rule these exports break, and nothing enforces it.
