---
type: architectural-drift
severity: low
affected_files:
  - src/cli/lib/agents/agent-plugin-compiler.ts
  - src/cli/lib/versioning.ts
  - src/cli/lib/skills/skill-plugin-compiler.ts
  - src/cli/lib/plugins/earlier-build.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: scope-discipline-deferred
status: resolved
resolved_by: >-
  `compileAgentPlugin` now builds the way `compileSkillPlugin` does. It refuses a folder holding
  its own source or files no build made, reads the earlier build (`readEarlierBuild`), clears it
  (`clearEarlierBuild`), writes the manifest at that build's version, copies the agent, and settles
  the version with `versionAfterRebuild` over `computeShippedHash`. The clearing helpers moved from
  `skill-plugin-compiler.ts` to `lib/plugins/earlier-build.ts`, so both compilers share them. The
  source-keyed version function and its manifest reader had no caller left and are deleted; their
  bump cases moved onto `versionAfterRebuild`'s specs. Guarded by the `rebuilding an agent plugin
  over its earlier build` specs in `agent-plugin-compiler.test.ts` and the same-named describe in
  `e2e/commands/build-agent-plugins.e2e.test.ts`.
---

## What Was Wrong

`build plugins --agents-dir` builds agent plugins through `compileAgentPlugin` in
`agent-plugin-compiler.ts`, and it kept both halves of the skill-plugin defects that
`2026-10-20-a-build-that-writes-over-its-earlier-output-keeps-every-file-the-source-has-since-dropped.md`
and `2026-10-21-a-plugin-version-keyed-on-its-source-stays-put-when-a-build-fix-changes-what-it-ships.md`
fixed for skills:

- Its version still comes from `determinePluginVersion`, keyed on a hash of the agent's source file
  alone. A change to what `generateAgentPluginManifest` writes ships under the same version.
- It writes into `agent-<name>/` with `ensureDir` and never clears it, so a file an earlier build
  left there keeps shipping.

Search for other places that version a plugin:
`grep -rn "determinePluginVersion\|bumpMajorVersion" src scripts --include='*.ts' | grep -v test`
finds `versioning.ts` and this compiler, and nothing else.

The default marketplace is not affected. It ships no agent plugins:
`ls dist/plugins | grep -c '^agent-'` in the skills repository answers 0, and its
`update-marketplace` script runs `build plugins` without `--agents-dir`.

## Fix Applied

None at discovery: `agent-plugin-compiler.ts` was outside the lane that fixed the skill half. The
fix landed later; `resolved_by` above names it.

## Proposed Standard

The same change, made for agents. `compileAgentPlugin` reads the earlier build with
`readEarlierBuild`, clears its folder the way `clearEarlierBuild` does in `skill-plugin-compiler.ts`,
writes the manifest at the earlier build's version, and settles the version with
`versionAfterRebuild(earlier, await computeShippedHash(pluginDir))` once the agent file is copied.
`determinePluginVersion` and its `readExistingPluginManifest` then have no caller and are deleted.
Its test is the skill one: build, plant a file in the built folder, rebuild, and expect the file
gone and a new major version.

This does not conflict with any CLAUDE.md rule.
