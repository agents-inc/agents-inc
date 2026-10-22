---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/lib/plugins/plugin-discovery.ts
  - packages/cli/src/cli/lib/plugins/plugin-discovery.test.ts
  - packages/cli/src/cli/lib/plugins/plugin-validator.ts
  - packages/cli/src/cli/lib/__tests__/kebab-name-judges-agree.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  The outer catches of `discoverAllPluginSkills` and `listPluginNames` and `validatePluginManifest`'s
  `Manifest file not found` branch are deleted. The proposed standard is not applied.
---

## What Was Wrong

Two specs in `plugin-discovery.test.ts` reached the outer `catch` of `discoverAllPluginSkills` and
`listPluginNames` by stubbing `fileExists` to reject with `EACCES`. `fileExists` is fs-extra's
`pathExists`, which answers `false` on any error and never rejects. `getVerifiedPluginInstallPaths`
catches the host's own failure itself. So nothing in production reaches either catch, and the two
specs pinned branches that only the stub could enter. Folding the redundant catch away changes no
behaviour, yet it reddens both specs.

`validatePluginManifest`'s `Manifest file not found` branch has the same shape. `validatePlugin`, its
only production caller, returns the structure check's `Missing .claude-plugin/plugin.json` first.
Only a direct call reaches the branch: the deleted lane spec, and
`__tests__/kebab-name-judges-agree.test.ts`, which always writes the file first.

## Fix Applied

The two `EACCES` specs and the direct `Manifest file not found` spec were deleted in the REPO-44 test
prune. The code is unchanged, so their mutants now survive. That is the accurate report: the
branches are dead. Removing the two catches and the branch is owed.

## Proposed Standard

`standards/e2e/anti-patterns.md`, or a unit-suite equivalent: a stub answers only what its real
collaborator can answer. Before a spec stubs a project module to throw, name the production input
that makes the real one throw. If there is none, the branch is dead, and the change it needs is a
deletion, not a test. This is the spec-side twin of
`2026-10-20-a-review-asked-for-a-test-to-kill-a-mutant-no-input-through-the-public-entry-can-reach`.
Nothing in `CLAUDE.md` conflicts with it.
