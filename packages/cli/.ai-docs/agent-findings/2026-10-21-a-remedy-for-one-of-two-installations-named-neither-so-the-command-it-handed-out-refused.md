---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/utils/messages.ts
  - packages/cli/src/cli/lib/configuration/project-config.ts
  - packages/cli/src/cli/lib/configuration/config.ts
  - packages/cli/src/cli/commands/doctor.ts
  - packages/cli/src/cli/commands/uninstall.tsx
  - packages/cli/src/cli/commands/init.tsx
  - packages/cli/src/cli/commands/edit.tsx
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-visible
status: partial
partial_note: >-
  Beside a second installation every remedy listed below now names the installation. Still open: a
  lone Codex installation's remedies hand out a bare `init --from`, which installs Claude, and
  `edit --ui --from` / `init --ui --from` beside two installations hand out a bare `edit --from`
  with no provider named to echo.
---

## What Was Wrong

A scope holding both providers' installations refuses every bare acting command (exit 2) until
`--provider` names one. Doctor's tips applied that rule through a private `commandActingOn`; the
remedies in `messages.ts` did not, so each handed out a command that refused:

- `recreateConfigFrom`, printed by doctor's unreadable-config tip and by every
  `installationConfigsUnreadable` refusal. `ConfigLoadError` recorded no provider, so nothing built
  from it could name one.
- `uninstallNeedsTerminal`, `sharedConfigNeedsTerminal` and `sharedConfigExistingInstall` (with the
  `applySharedConfigHere` line inside it), each dropping the `--provider` the run was given.
- `nothingInstalledToApplyTo` dropped it too, so `edit --from X --provider codex` with nothing
  installed sent the user to a bare `init --from X`, which installs Claude.

Census, read whole:
`grep -rnE "CLI_INVOKE_COMMAND\} (uninstall|compile|edit|eject|share|doctor|list|init)" packages/cli/src/cli --include='*.ts' --include='*.tsx' | grep -v test`.
Reproduced against the built CLI, and fixed: the five above. Reproduced, and left open: a lone Codex
installation with a broken config gets the bare recreate remedy, and following it installs Claude
(`uninstall --yes` then `init --from GLOB` left `.agents-inc/claude` only); the same bare `init`
half is in `sharedConfigNeedsTerminal` and doctor's orphan tip where no provider was named. Not
reproduced: the bare `compile` in `RUN_COMPILE`, `RECOMPILE` and edit's recompile hint.

## Fix Applied

`providerArgument` in `messages.ts` is the rule, and doctor's `commandActingOn` now calls it.
`ConfigLoadError` carries `providerToName`, from `providerToNameAt` in
`lib/installation/provider-to-name.ts`: the provider where the scope root also holds another
installation's `config.ts`, else nothing. `config.ts`'s own refusal computes it the same way, since
it cannot import `project-config.ts` without a cycle through `stacks-loader.ts`. `uninstall`,
`edit --from` and `init --from` pass the provider the run named. Held by
`remedies-name-the-installation-beside-another.test.ts`: its six named cases went red with
`providerArgument` returning nothing, and its four bare controls stayed green.

## Proposed Standard

`clean-code-standards.md`, beside 5.8: a command a message hands out names `--provider` through
`providerArgument` wherever the run is about one of two installations, and a remedy built from an
error takes the provider from the error. Whether an `init --from` half should also name a provider
that is not the default, which the lone-Codex case needs, is open; the folder that records the
provider is the one the remedy's uninstall removes.
