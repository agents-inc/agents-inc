---
scope: reference
area: concepts
keywords:
  [
    source-folder,
    SOURCE_ROOT_DIR,
    sourceDir,
    sourceDirName,
    sourceFolderInUse,
    sourceRootOf,
    relativeConfigPath,
    sourceFolderName,
    retiredSourceFolderIn,
    everySourceFolderName,
    providerInUse,
    chooseProviderForThisRun,
    detectInstallations,
    PROVIDERS,
    Provider,
    install-layout,
    config-types,
  ]
related:
  - reference/concepts/plugin-hosts.md
  - reference/features/configuration.md
  - reference/concepts/scope-system.md
last_validated: 2026-10-04
---

# The source folder

Every installation lives in `.agents-inc/<provider>/` (`claude`, `codex`), at both scopes.
`sourceFolderInUse` in `src/cli/lib/installation/install-layout.ts` answers it for every root, and
every path the CLI builds under a source folder comes from it. `doctor`'s `Layout` row names the
folder each scope's installation is on.

A run whose project or HOME holds the retired source folder prints one startup line from the oclif
`init` hook (`src/cli/hooks/init.ts`), through `retiredSourceFolderIn` in `install-layout.ts` and
`retiredSourceFolderUnsupported` in `src/cli/utils/messages.ts`, and then runs as it would without
it. `RETIRED_SOURCE_FOLDER` in `install-layout.ts` is the one place the folder's name is written.

## Two PROVIDERS in one scope is a different state, and it is allowed

`.agents-inc/claude/` beside `.agents-inc/codex/` is two installations, which is a supported thing
to have. Each provider family inherits and propagates only within itself. Both are live: `edit`,
`uninstall`, `share`, `eject`, `compile` and `update` refuse to GUESS, naming `--provider`; `doctor`
reports the finding and `list` names both above the one it shows.

The refusal is `refuseAnAmbiguousInstallation` in
`src/cli/lib/installation/provider-flag.ts`, and `ambiguityFinding` beside it is the reporting form
`doctor` uses — a read-only command that refused would leave a user unable to LOOK at the one state
they most need to see. `otherInstallationsInThisScope`, the third form in that module, is `list`'s:
it names both installations and says which one the report below it is, because `list` neither acts
on one nor describes them all. All three read `installationsInPlay` in that module: the project's
installations first, and the global's only where the project has none, out of
`detectInstallations` in `src/cli/lib/installation/detect-installations.ts`, which answers every
installation it can see.

**Nothing ties a folder's contents to its name.** There is no `provider` field in `config.ts`, so a
Claude configuration copied into `.agents-inc/codex/` is a Codex installation that never met the
Codex install's pre-flight. `refuseUnofferedPlacements` in
`src/cli/lib/hosts/offered-placements.ts` is called from the config-READ path for that reason, not
only from `init`.

## Specs

- `e2e/commands/retired-source-folder.e2e.test.ts` — the startup line, once per run, paired with a
  run where neither scope holds the folder; and the folder ignored.
- `src/cli/lib/installation/install-layout.test.ts` — the folder a root resolves to.
