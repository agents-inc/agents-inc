---
type: standard-gap
severity: medium
affected_files:
  - e2e/pages/wizards/edit-wizard.ts
  - e2e/fixtures/project-builder.ts
  - e2e/helpers/test-utils.ts
  - e2e/pages/terminal-screen.ts
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
  - .ai-docs/standards/e2e/page-objects.md
date: 2026-08-09
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  CLI-466. The `EditWizard` launcher records its `source` option in the install's config instead of
  passing `--source`; `ProjectBuilder.editable` / `pluginProject` / `localProjectWithMarketplace` /
  `withCustomSkill` take a `source` that lands in the config they write; `recordInstallSource()` in
  e2e/helpers/test-utils.ts does the recording for fixtures that build their install by hand, and
  searches project-then-HOME in `resolveSource`'s own order. Every spec that pointed a non-init
  command at a source through `--source` or `CC_SOURCE` was re-pointed at stored resolution.
  `TerminalScreen` now abandons any wait the moment the session shows `Nonexistent flag`, so the
  next flag mistake costs a second rather than a 45s timeout per wait.
---

## What Was Wrong

The E2E suite pointed commands at a test source through three channels, and two of them were the
command's own input rather than the installation's state:

| Channel                                   | Sites                               |
| ----------------------------------------- | ----------------------------------- |
| `--source` on the command line            | ~10 `compile` runs, 1 `edit` guard  |
| `CC_SOURCE` in the run's environment      | ~35 across doctor/search/eject/edit |
| `--source` from the `EditWizard` launcher | 142 launches                        |

All three describe a RUN. The product describes an INSTALL: `config.ts` records the source an
installation answers to, and every command after `init` reads it from there. The suite could not
see the difference because both spellings produced the same catalogue — until CLI-466 withdrew the
flag from `edit` / `compile` / `uninstall` / `list` and narrowed the environment variable to
init-time, at which point ~180 sites were describing a run nobody could make.

Two consequences, both worth recording because neither is visible from a green suite:

1. **A silent weakening was available.** Dropping the channel without replacing it does not fail
   most specs — it points them at the DEFAULT marketplace, which carries `react`, `vitest` and
   friends under the same ids the E2E fixture uses. Assertions keep passing against a catalogue
   fetched over the network. Two specs (`uninstall-global-propagation`,
   `dual-scope-mixed-source-compiled-ref`) were caught only by `no-unused-vars` on the now-unused
   `sourceDir`, and nothing else in the suite would have said a word.

2. **Recording late is not the same as recording early.** The first attempt had the launcher stamp
   the source into `config.ts` just before spawning. Eight specs went red — every one of them a
   spec that snapshots `config.ts` before the wizard and asserts it byte-identical after
   ("aborting a preview must not rewrite config.ts"). The stamp is a legitimate change the snapshot
   is right to see. The source has to be part of the fixture, not part of the launch, which is why
   the builders take it.

## Fix Applied

- `recordInstallSource(baseDirs, source)` (`e2e/helpers/test-utils.ts`) — records `source` in the
  first config it finds, searching project-then-HOME, and leaves a config that already names one
  untouched (a wizard-written install recorded its own). Throws when there is no config at all,
  because silently doing nothing is exactly the weakening above.
- `ProjectBuilder.editable`, `.pluginProject`, `.localProjectWithMarketplace` and `.withCustomSkill`
  take a `source` that lands in the config they write.
- `EditWizard`'s `source` option keeps its meaning ("the source this install answers to") and
  changes its mechanism from a flag to a recording.
- `TerminalScreen` fails a wait immediately on `Nonexistent flag` rather than burning the budget.

## Proposed Standard

In [`test-data.md`](../standards/e2e/test-data.md), beside the fixture rules: **a fixture points a
command at a source by RECORDING it, never by passing it.** `--source` is `init`'s flag and
`CC_SOURCE` is read at install time only, so any other spelling is describing a run the product
does not have. Record it where the install would — `ProjectBuilder`'s `source` option, or
`recordInstallSource()` for a hand-built install — and record it **before** any snapshot the spec
compares against, since the recording is itself a config write.

And in [`page-objects.md`](../standards/e2e/page-objects.md): **a launcher option that models
install state must be applied at build time, not at launch.** The `EditWizard.source` option is the
worked example — it reads like a flag and is not one.
