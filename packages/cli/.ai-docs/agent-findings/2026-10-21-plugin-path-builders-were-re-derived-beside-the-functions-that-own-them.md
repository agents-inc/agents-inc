---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/plugins/plugin-manifest.ts
  - src/cli/lib/plugins/plugin-settings.ts
  - src/cli/lib/plugins/plugin-validator.ts
  - src/cli/lib/plugins/plugin-finder.ts
  - src/cli/lib/content-validator.ts
  - src/cli/lib/agents/agent-plugin-compiler.ts
  - src/cli/lib/installation/installation.ts
  - src/cli/lib/matrix/matrix-loader.ts
  - src/cli/lib/skills/skill-plugin-compiler.ts
  - src/cli/lib/loading/loader.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  Every member in lane X4's files is fixed. One literal remains in src/cli/lib/loading/loader.ts,
  which another lane owns. No checker was added for either rule.
---

## What Was Wrong

Two CLAUDE.md rules had drifted in the plugin modules, and nothing reports either one.

"NEVER reassign constants to other constants". Census, run from `packages/cli` against the tree
as this lane found it:

```
grep -rnE '^(export )?const [A-Z][A-Z0-9_]+ = [A-Z][A-Z0-9_]+(\.[A-Z][A-Z0-9_]+)?;' src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -v __tests__
```

It found five aliases: `PLUGIN_DIR_NAME` and `PLUGIN_MANIFEST_FILE` in `plugin-manifest.ts`,
`PLUGIN_DIR` and `PLUGIN_MANIFEST` in `plugin-validator.ts`, and `SETTINGS_FILE` in
`plugin-settings.ts`. Two more, `MAX_PLUGIN_FILE_SIZE` and `MAX_CONFIG_FILE_SIZE = ONE_MB` in
`consts.ts`, name separate limits and are not the defect.

"No hardcoded strings". Census:

```
grep -rnE 'path\.join\([^)]*"(skills|agents)"|`(skills|agents)/\$\{' src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -v __tests__
```

It found six: `installation.ts`, `matrix-loader.ts`, `plugin-finder.ts`,
`skill-plugin-compiler.ts`, `agent-plugin-compiler.ts` and `loading/loader.ts`. They spell out
`STANDARD_DIRS.SKILLS` and `STANDARD_DIRS.AGENTS`.

Alongside these, three modules rebuilt paths that a sibling already builds. These were found by
reading, not by a grep, so they are a sample:

- `writePluginManifest` rebuilt `getPluginManifestPath`.
- `findPluginDirectories` in `content-validator.ts` was a copy of `listPluginDirNames` in
  `plugin-validator.ts`.
- `agent-plugin-compiler.ts` rebuilt `getPluginAgentsDir`, and wrote the `agent-` prefix three
  times beside the private constant that `generateAgentPluginManifest` used.

`2026-10-21-library-modules-re-declare-shared-helpers-privately-and-one-copy-points-at-its-twin-in-a-comment`
is the same class in other modules.

## Fix Applied

All five aliases are removed. `writePluginManifest` calls `getPluginManifestPath`, and
`content-validator.ts` calls the newly exported `listPluginDirNames`. `agent-plugin-compiler.ts`
calls `getPluginAgentsDir` and the new `agentPluginName`. Five of the six literals now use
`STANDARD_DIRS`. `loading/loader.ts` is reported to its lane rather than edited. Re-running the
alias census finds only the two `consts.ts` limits.

## Proposed Standard

No new rule is needed; both are already in CLAUDE.md. The gap is enforcement. A `no-restricted-syntax`
selector could catch a top-level `const` whose initialiser is a bare SCREAMING_CASE identifier or
member. The literal rule has no honest lint: `"skills"` is also a field name, as in
`schemas.ts`'s `["skills", index]` path. The census above is the only instrument for it.
