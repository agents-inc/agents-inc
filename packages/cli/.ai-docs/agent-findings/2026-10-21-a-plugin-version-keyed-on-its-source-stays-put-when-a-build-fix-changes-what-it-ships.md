---
type: missing-standard
severity: low
affected_files:
  - src/cli/lib/versioning.ts
  - src/cli/lib/skills/skill-plugin-compiler.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  The owner's one-off bump of the 38 plugins is in the skills repository's working tree, uncommitted
  on 2026-10-21. Separately, a skill plugin's version was made to follow what its build ships. `compileSkillPlugin` reads the earlier build before clearing
  it (`readEarlierBuild` in `versioning.ts`, whose `computeShippedHash` hashes every file in the
  plugin's folder by path and bytes), writes the rebuild at that build's version, and bumps the
  major only when the rebuilt folder hashes differently (`versionAfterRebuild`). It compares with
  the earlier build on disk rather than a stored hash, so the change of basis bumped nothing - two
  rebuilds over a scratch copy of the skills repository left its dist byte-identical. The
  `.content-hash` file is still written, because every plugin built so far ships it and dropping it
  would bump them all. Guarded by `e2e/commands/build-plugins-bumps-a-plugin-whose-build-changed.e2e.test.ts`
  and the `rebuilding a plugin over its earlier build` specs in `skill-plugin-compiler.test.ts`.
---

## What Was Wrong

`determinePluginVersion` in `versioning.ts` bumps a plugin's major version only when
`computeSkillFolderHash` changes, and that hash reads the skill's source alone. So a change to what
a plugin ships that comes from the build rather than the source goes out under the version it
already had.

The rebuild of the skills repository's `dist/plugins` after the stale-output fix
(`2026-10-20-a-build-that-writes-over-its-earlier-output-keeps-every-file-the-source-has-since-dropped.md`)
is the case. It removed 64 orphan files from 40 plugins. 38 of those plugins kept their version,
because their source had not changed. Census: in the skills repository, every plugin with a
deleted file under `git status --short -- dist`, minus the plugins whose `src/skills/<name>/` also
shows in `git status --short`.

Claude Code caches an installed plugin in a folder named by its version
(`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`). On the reporting machine, 24 orphan
files across 13 plugins are still cached under the same version number the rebuilt dist now ships
without them, for example `web-framework-react/5.0.0/skills/web-framework-react/examples/icons.md`.
That count is a census of one machine's cache. If an update check compares versions, which is an
inference and was not tested, those installs will never be told the files are gone.

## Fix Applied

None. This is discovery only. There are two ways to fix it, and choosing between them is the
owner's call: hash the built plugin rather than its source, or bump the 38 plugins once by hand.

## Proposed Standard

`clean-code-standards.md`, beside the rule the stale-output finding proposes: **a version that consumers cache
by must change whenever the published bytes change, whatever caused the change.** Derive it from the
output, or record why a build-only change cannot reach consumers. A test that would catch a breach
builds a plugin, changes only the compiler's output for it, rebuilds, and expects a new version.

This does not conflict with any CLAUDE.md rule.
