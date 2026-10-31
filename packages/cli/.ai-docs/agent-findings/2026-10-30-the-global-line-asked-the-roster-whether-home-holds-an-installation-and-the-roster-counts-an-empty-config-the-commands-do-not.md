---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/installation/provider-flag.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-30
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `homeHoldsAnInstallationFor` in `src/cli/lib/installation/provider-flag.ts` counts a HOME config
  only where it declares content (`configDeclaresNothing`, degrading to "counts" on
  `ConfigLoadError`); the describe "under a HOME holding only a config that declares nothing" in
  `src/cli/lib/__tests__/commands/a-project-config-declaring-nothing.test.ts` pins list, compile,
  share, update, edit and doctor.
---

## What Was Wrong

From a project whose config declares nothing, under a HOME holding only a config that also declares
nothing (what `eject` run at HOME leaves, through `ensureBlankPair`), compile, share, edit and list
printed "This project's config declares nothing, so this works on your global installation." and
then "No installation found." The line's predicate, `homeHoldsAnInstallationFor`, read HOME through
`detectInstallations`, whose docblock counts HOME's config "however empty"; the commands read it
through `detectInstallationInDir` in `lib/installation/installation.ts`, where "Content-less is not
an installation". Two reads of the same question, so the line and the command disagreed. Found by
the reviewer on the built CLI.

This is the second declares-nothing line found stating something a different read decides; the
first is `2026-10-30-uninstall-said-there-was-nothing-to-uninstall-before-planning-and-then-removed-a-projects-ejected-copies`.

## Fix Applied

The predicate keeps the roster's global entries filtered by `named`, then asks each config whether
it declares content, as the commands' read does. `detectInstallations` is unchanged: the
two-installations refusal and `uninstall` at HOME removing an empty global config rely on it
counting the placeholder. Six cases went red on the old predicate (each received the global line),
then green.

Other readers of the roster at HOME, not examined here
(`grep -rn 'detectInstallations(' packages/cli/src --include='*.ts' --include='*.tsx' | grep -v test`,
2026-10-30): `provider-flag.ts` (`installationsInPlay`), `plugins/plugin-info.ts`,
`config-gate/propagate.ts`, `doctor/installation-reads.ts`, `hooks/init.ts`.

## Proposed Standard

`packages/cli/CLAUDE.md` already requires displayed paths to come from "the same scope-aware read
that produced the counts". Widen it: a line telling the user what a command will work on is
computed from the read the command then acts through, never from a sibling read that answers a
similar question. No gate can see a second read; the guard is a spec running the command in the
state where the two reads differ.
