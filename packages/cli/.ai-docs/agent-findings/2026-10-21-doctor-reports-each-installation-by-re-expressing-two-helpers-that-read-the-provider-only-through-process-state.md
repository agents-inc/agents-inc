---
type: architectural-drift
severity: low
affected_files:
  - src/cli/lib/doctor/installation-reads.ts
  - src/cli/lib/plugins/plugin-discovery.ts
  - src/cli/lib/hosts/configured-placements.ts
  - src/cli/lib/installation/source-scopes.ts
  - src/cli/lib/content-validator.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`doctor` now reports one block per provider when a scope holds a Claude and a Codex installation.
Each block must read its own installation's folders, and the brief forbade setting the run's
provider (`chooseProviderForThisRun`) to get there. Three helpers the operational rows used read
the provider only through `providerInUse`, and took no provider of their own:

- `getVerifiedPluginInstallPaths(projectDir)` (`lib/plugins/plugin-discovery.ts`) asks
  `hostAt(projectDir)`.
- `unofferablePlacementsFound(cwd)` (`lib/hosts/configured-placements.ts`) loads each scope's config
  with `loadInstalledConfig` and refuses with `hostAt(root)`.
- `sourceScopesInPlay(cwd)` (`lib/installation/source-scopes.ts`) described each scope with
  `providerInUse(root)`.

The content layer was left provider-blind and still reads one installation in a two-installation
scope: `validateProjectConfigFile` and `findConfigLoadFailures` load only the config `providerInUse`
picks, `validateInstalledSkills` walks `resolveInstallPaths` folders, and `validateInstalledAgents`
lists `.md` files only (`listAgentMdFiles`). A broken Codex `config.ts` beside a Claude one therefore
reaches the operational layer, where the Codex block reports it on its Config Valid row instead.

Census of the helpers, run 2026-10-21 from `packages/cli`:

```
grep -rn 'export async function getVerifiedPluginInstallPaths\|export async function unofferablePlacementsFound\|export async function sourceScopesInPlay' src/cli
```

## Fix Applied

`sourceScopesInPlay` takes a `providerOf` parameter that defaults to `providerInUse(root)`, and
doctor's Layout row passes the block's hosts. The other two are re-expressed in
`lib/doctor/installation-reads.ts`, outside their own files: `installedPluginSkillIds` for
`getVerifiedPluginInstallPaths` and `unofferablePlacements` for `unofferablePlacementsFound`. With
the hosts read off the disk they answer as the originals do, the project's placement findings
first; `installation-reads.test.ts` holds that order. They are still second declarations of two
rules.

## Proposed Standard

Give `getVerifiedPluginInstallPaths` and `unofferablePlacementsFound` the parameter
`sourceScopesInPlay` now has, defaulting to what `providerInUse` reads today, then delete the two
copies and call the helpers with the block's hosts. A rule for `packages/cli/CLAUDE.md` beside the
scope rules: a read that a per-installation report may need takes the provider as a parameter
rather than reading the process's choice, because `--provider` is process state and one report can
be about two installations. Not checked against an existing standard; nothing in CLAUDE.md speaks
to it.
