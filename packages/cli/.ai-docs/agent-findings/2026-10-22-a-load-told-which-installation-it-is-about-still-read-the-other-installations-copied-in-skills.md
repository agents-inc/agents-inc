---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/lib/skills/local-skill-loader.ts
  - src/cli/lib/loading/source-loader.ts
  - src/cli/lib/loading/multi-source-loader.ts
  - src/cli/lib/doctor/installation-reads.ts
  - src/cli/commands/doctor.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  The local-skill discovery now takes the provider the load was asked for, at both scopes. Sibling
  3 below is repaired since: `hostsOnDisk` reads a home holding both installations as the global of
  the project's own provider (`installation-reads.test.ts` and
  `e2e/lifecycle/codex-doctor-under-a-home-holding-both-global-installations.e2e.test.ts`).
  Siblings 1 and 2 still resolve the provider by roster order, unrepaired.
---

## What Was Wrong

`loadSkillsMatrixFromSource({ provider })` is how `doctor` says which of two installations a block
is about. The option reached `resolveSource`, which reads that provider's config at both rungs, but
not `mergeLocalSkills`, beside it in the same function. `discoverLocalSkills(root)` asked
`providerInUse(root)`, and a root holding two live installations answers by roster order, so it
answers Claude.

So in a project holding a Claude and a Codex installation, the Codex block's matrix carried
`.claude/skills` and never `.agents/skills`. A skill the Codex payload carried, which no marketplace
offers, was reported `✗ … (not found)`. `doctor` exited 1 over a state it itself calls supported
(`2 installations here, each checked below`), and it has no `--provider` flag to route around it.

The global half was the same defect one rung up, and no earlier report named it: the global
discovery asked `providerInUse(os.homedir())`. With a home holding a Claude and a Codex global that
carry different skills, `doctor` failed in a Codex project, and failed in the Codex block at home
too.

This is one more instance of the class
`2026-10-21-doctor-reports-each-installation-by-re-expressing-two-helpers-that-read-the-provider-only-through-process-state.md`
names: a read a per-installation report needs takes no provider of its own.

## Fix Applied

`discoverLocalSkills(root, provider = providerInUse(root))`, threaded through `mergeLocalSkills` and
`mergeDiscoveredLocalSkills` to both scopes. Callers that name no provider read what they read
before.

Red, then green:

- `local-skill-loader.test.ts`: "in a folder holding a Claude and a Codex installation". The Claude
  case is the control and was green throughout.
- `source-loader.test.ts`: "a load asked for one of the two installations a scope holds". This
  covers both scopes, with the Claude case as the control.
- `e2e/lifecycle/codex-doctor-beside-a-claude-installation.e2e.test.ts`: Claude and then Codex
  carrying a 33-character name, `doctor` run with no terminal and at a 120-column PTY. Both modes
  were red with `✗ 1/2 skills found`.

Reading the global scope with the named provider then broke `doctor` in a folder holding no
installation under a Codex global: exit 0 became exit 1, with the global's carried skill
`(not found)`. `hostsOnDisk` read the folder's provider off the folder itself, and an empty folder
answers the provider a new installation would get, Claude, so the load looked in `~/.claude/skills`.
The same wrong provider already had the `Marketplace Reachable` row read the default marketplace
rather than the one the Codex global's config names. `hostsOnDisk` now checks a project holding no
installation, under a home holding one, as that global installation, with its provider at both
scopes.

- `installation-reads.test.ts`: "checks a project holding no installation as the global one it
  inherits". The existing case, a project and a home on different providers, is the control.
- `e2e/lifecycle/codex-doctor-in-a-folder-inheriting-the-global-installation.e2e.test.ts`: a global
  installation carrying an external skill, `doctor` in a folder holding none, with no terminal and
  at a 120-column PTY. The Codex cases were red with `✗ 0/2 skills found` and the default
  marketplace reached over the network. The Claude cases are the control and were green throughout.

## Siblings left unrepaired

Census:

```
grep -n "loadGlobalSourceConfig()\|projectDir: os.homedir() })\|pluginSkillIdsIn(os.homedir())" src/cli/lib/loading/*.ts
grep -n "providerInUse(os.homedir())" src/cli/lib/doctor/installation-reads.ts
```

These are the hits, all of them provider-blind where a scope holds both installations:

1. `source-loader.ts`, in `globalPluginSkillsUncarried` (`loadGlobalSourceConfig()`) and
   `loadGlobalInstallationCatalogue` (`resolveSource({ caller: "stored", projectDir: os.homedir() })`).
   A home holding both globals seats the roster-order global's plugin skills, not the asked
   provider's. This is an inference that was not reproduced. The repair needs
   `loadGlobalSourceConfig` in `configuration/config.ts` to take a provider.
2. `multi-source-loader.ts`, in `collectPluginSkillIds` → `discoverAllPluginSkills` → `hostAt(dir)`.
   It only annotates `availableSources` and changes no row's verdict. This was read, not reproduced.
3. `doctor/installation-reads.ts`, in `hostsOnDisk`, where the global host of a project holding its
   own installation is `providerInUse(os.homedir())`. This one was reproduced. With a home holding
   a Claude global and a Codex global, a Codex project's `Skills Installed` row warns
   `external-web-tooling-web-application-security-testing (not found in .claude/skills/)` for the
   Codex global's own ejected skill. It warned identically before and after both fixes, and the run
   exits 0.

## Proposed Standard

This is the rule the 2026-10-21 finding proposes, unchanged: a read that a per-installation report
may need takes the provider as a parameter, defaulting to `providerInUse`. To that it adds one
clause. **An option that names the installation is threaded to every read of the load it is
passed to, at both scopes, and names the installation in play**: for a folder holding none, the
global one it inherits, never what `providerInUse` answers for the empty folder. For
`packages/cli/CLAUDE.md`, under "Scope Awareness". Not checked against an existing standard;
nothing in CLAUDE.md speaks to it.
