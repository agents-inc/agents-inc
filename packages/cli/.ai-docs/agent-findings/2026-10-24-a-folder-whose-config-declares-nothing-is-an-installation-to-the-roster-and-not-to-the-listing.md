---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/installation/provider-flag.ts
  - src/cli/lib/installation/detect-installations.ts
  - src/cli/lib/installation/installation.ts
  - src/cli/lib/installation/install-layout.ts
  - src/cli/lib/configuration/project-config.ts
  - src/cli/lib/seed/installation-payload.ts
  - src/cli/lib/doctor/installation-reads.ts
  - src/cli/commands/update.ts
  - src/cli/commands/edit.tsx
  - src/cli/commands/uninstall.tsx
  - src/cli/commands/eject.ts
  - src/cli/hooks/init.ts
  - src/cli/lib/config-gate/propagate.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-24
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  Code half landed (CLI-971, owner 2026-10-24 "Never count it, and say so"): the roster, the
  listing and the fan-out now agree that a project config declaring nothing is not an
  installation; see Fix Applied. Pending: the Proposed Standard is not written into CLAUDE.md.
---

## What Was Wrong

Two reads disagree on what counts as an installation.

- `detectInstallations` in `detect-installations.ts` counts any folder holding a `config.ts`.
  `installationsInPlay` in `provider-flag.ts` builds its roster from it. That roster feeds `list`'s
  which-installation line, `refuseAnAmbiguousInstallation`, `ambiguityFinding` and
  `providersInPlay`.
- `detectInstallationInDir` in `installation.ts` also returns `null` for a config that declares
  nothing (`declaresNoContent`). So `detectInstallation`, which is what `list` shows, falls through
  to HOME.

So for a folder whose own config declares nothing, the roster judges the folder while the listing
shows HOME. Reproduced on the built CLI on 2026-10-24, one fresh process per command, `env -i`, a
scratch HOME holding a real Claude and a real Codex installation (`init --from`). The project's
`.agents-inc/claude/config.ts` was `export default { name: 'empty', agents: [], skills: [] }`.

| Run from the project                      | Printed above the listing                                                         | Listed config                         |
| ----------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| `list`                                    | nothing                                                                           | `<home>/.agents-inc/claude/config.ts` |
| `list --provider codex`                   | nothing (as designed)                                                             | `<home>/.agents-inc/codex/config.ts`  |
| control: same HOME, empty project, `list` | `<home> holds 2 installations — claude and codex — and this is the claude one. …` | `<home>/.agents-inc/claude/config.ts` |

The user docs (`configuration/providers.md`) say `list` names both installations above the one it
shows when one scope holds both. The scope shown holds both, and nothing is printed.

**Inference, not run:** the acting commands' refusal reads the same roster. So an acting command
run from such a folder sees one installation in play and does not refuse, while acting on whatever
`detectInstallation` hands it. That is the "two installations are never acted on silently" journey
(row 64 of `standards/e2e/user-journeys.md`).

A pruned finding is the same class one command over:
`2026-08-08-doctor-still-calls-a-loadable-but-content-less-config-not-found` (INDEX only).

## Fix Applied

CLI-971, 2026-10-26. The owner ruled the direction (card q-cli-empty-config-counts, 2026-10-24):
never count it, and say so. One predicate, `declaresNoContent` in `lib/configuration/project-config.ts`
(moved there from `installation.ts`), is now asked by every read below.

- The roster: `detectInstallations` skips a project's config that declares nothing; HOME's
  counts however empty. A config that cannot be loaded still counts, as `holdsItsOwnInstallation`
  holds.
- `providerOnDisk` (`install-layout.ts`) cannot load a config, being synchronous, so the roster
  records each project config's answer against the file's mtime and size, and the `init` hook
  primes it before any path is read.
- The direct readers: update's `loadInstalledConfig`, share and edit's `readInstalledConfig`
  (`installation-payload.ts`) and edit's `ensureInstalledSkillsReadable` read `loadConfigInPlay`;
  uninstall's `readSourceFolder` treats such a project config as the user's file and removes
  nothing; eject's `ensureConfig` docblock no longer claims `compile` works afterwards.
- `compile`, `update`, `share`, `edit`, `list` and `doctor` print one stderr line first
  (`INFO_MESSAGES.GLOBAL_INSTALLATION_STANDS_IN`) when such a config sends them to HOME.

Pinned by `src/cli/lib/__tests__/commands/a-project-config-declaring-nothing.test.ts`, the roster
rows in `provider-flag.test.ts` and `installation-reads.test.ts`, the empty-config rows in
`old-claude-src-folder.test.ts`, the fan-out row in `propagation-reconciles-each-project.test.ts`,
the refresh-tool rows in `update.test.ts`, and
`e2e/lifecycle/a-folder-whose-config-declares-nothing-under-a-home-holding-both.e2e.test.ts`.

Review round (2026-10-26):

- `loadConfigInPlay` reads HOME off HOME's own folder, as `detectInstallation` does. It read HOME
  with `providerInUse(projectDir)`, which a leftover `.agents-inc/codex/` steered, so `update`,
  `share` and `edit` found no installation where `list` found HOME's Claude one. The same read
  also closed the older shapes: a project holding no config under a Codex-only HOME, and a
  project holding a non-empty `.agents-inc/codex/` and no config.
- `update` refreshes through the tool of the installation it read (`hostFor(loaded.provider)`),
  not the cwd's.
- `doctor`'s Config Valid row names the project's config that declares nothing, in whichever
  folder it is, rather than saying the project holds no `config.ts`. `ConfigState`'s inherited
  case carries it as `declaringNothingIn`.
- `propagateToProject` and `wouldBeRewritten` (`config-gate/propagate.ts`) pass over a
  registered project whose config declares nothing, as `gone`, and leave the file as written.

Second review round (2026-10-26): the `init` hook primes the record for the cwd only, so the
fan-out still counted a registered project's leftover. A real Codex installation beside an empty
Claude config was skipped by a Codex fan-out as another provider's, and a Claude fan-out called it
`gone`. The fan-out now asks the roster (`providersInstalledAt`) before `providerInUse` reads the
project, and a project counts as this provider's only where the roster holds one, so
`--provider claude` gives `notOurs` there too. Pinned by the three leftover-beside-Codex rows in
`propagation-reconciles-each-project.test.ts`.

The class, as a census of product reads of a config (2026-10-26):
`grep -rn "loadProjectConfig(\|loadProjectConfigFromDir(\|loadProjectConfigAt(\|loadInstalledConfig(\|detectInstallations(\|declaresNoContent(\|loadConfigInPlay(" src/cli --include='*.ts' --include='*.tsx' | grep -v "\.test\.\|__tests__"`.
The reads that decide whether a project holds an installation are the ones listed above, plus
`detectInstallationInDir` and doctor's `readConfigState`, which already skipped such a config. The
others read HOME, a field such as `marketplace` that an empty config still carries, or a project
an earlier read chose.

`providerInUse` counts such a config wherever the roster has not read that root first. Census:
`grep -rn "providerInUse(" src/cli --include='*.ts' --include='*.tsx' | grep -v "\.test\.\|__tests__"`.
The only project roots it reads besides the cwd (primed by the `init` hook) and HOME (whose config
counts however empty) are the fan-out's registered projects and the recompile of those it updated
(`recompilePropagated`), and `providersInstalledAt` primes each before either reads it.

Discovered during CLI-969, which fixed the other half of the class:
`otherInstallationsInThisScope` now reads the installation it calls "shown" off the scope root its
own roster chose, not off the cwd.

## Proposed Standard

One definition of "an installation in this scope", shared by the roster and by
`detectInstallation`: either both count a config that declares nothing, or neither does. Proposed
place: `packages/cli/CLAUDE.md` → "Scope Awareness". It would sit beside the rule that display
paths come from the same scope-aware read as the counts. This does not conflict with any
NEVER/ALWAYS rule. Which way to go (count it or skip it) is a behaviour question for whoever takes
the row, and it is not decided here.
