---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/installation/provider-flag.ts
  - src/cli/lib/installation/detect-installations.ts
  - src/cli/lib/installation/installation.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-24
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
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

None. This is a discovery only, made during CLI-969. That work fixed the other half of the class:
`otherInstallationsInThisScope` now reads the installation it calls "shown" off the scope root its
own roster chose, not off the cwd. Fixing this half means changing the roster `installationsInPlay`
reads, and that changes what every acting command's refusal and `doctor`'s finding see. That is
outside that lane.

## Proposed Standard

One definition of "an installation in this scope", shared by the roster and by
`detectInstallation`: either both count a config that declares nothing, or neither does. Proposed
place: `packages/cli/CLAUDE.md` → "Scope Awareness". It would sit beside the rule that display
paths come from the same scope-aware read as the counts. This does not conflict with any
NEVER/ALWAYS rule. Which way to go (count it or skip it) is a behaviour question for whoever takes
the row, and it is not decided here.
