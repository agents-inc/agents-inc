---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/src/cli/lib/__tests__/commands/edit-from-plugins-says-what-it-did.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/compile-says-what-it-did.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/init-from-plugins-says-what-it-did.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/init-from-says-what-it-did.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-24
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  edit-from-plugins-says-what-it-did.test.ts is repaired: each spec that applies now checks the
  config, the local copies and the plugin host's calls. The three sibling files the census below
  names are unchanged and were not examined spec by spec.
---

## What Was Wrong

`packages/cli/CLAUDE.md` says: "ALWAYS verify config AND filesystem after any operation that
changes either". In `edit-from-plugins-says-what-it-did.test.ts`, eleven specs answer y and apply
a configuration, and checked only what the run printed:

- eight checked no state at all;
- three checked one file and no config.

The census (from `packages/cli`, before the change):

```
grep -nE '^\s*it\("|applyAnswered\(KEY_|readFile\(|readTestTsConfig<|fileExists\(|directoryExists\(|uninstallPlugin' src/cli/lib/__tests__/commands/edit-from-plugins-says-what-it-did.test.ts
```

An apply that kept a dropped entry in `config.ts`, uninstalled nothing, or installed at the wrong
scope stayed green in every one of them, as long as it printed the same lines. The file is named
for what the command says, and its specs read that as the whole subject.

## Fix Applied

None of the eleven could answer n instead. A probe that made every measured run answer n failed
each of them on a line printed only after the confirm (`Changes:`, `Switching…`, `Copying…`,
`Installing…`, `Installed…`). `logChangeSummary` and `announceMigrations` run inside
`applyApprovedChanges`.

So each spec still answers y. Every existing check is kept, and each spec now also checks:

- **the project config's skills**, as whole entries built with `buildSkillConfig`, read with
  `readTestTsConfig<FixtureProjectConfig>`;
- **the local copies** where the run copies or deletes one (a `readdir` roster, or
  `directoryExists` with a guard that the copy existed before);
- **the global config's skills**, unchanged, where a global install sits beside the project;
- **the host's calls**, exactly (`installPlugin` / `uninstallPlugin` `mock.calls`). The host is a
  module mock, so no plugin reaches disk; what it was asked is the plugin side's state. Setup runs'
  calls are cleared first.

Each new check was shown to fail under a mutant of its subject. The mutants were applied as the
tests loaded, and no product file was written. Spec assertions ran soft, so every failing check
showed:

| Mutant                                               | Reddens                                            |
| ---------------------------------------------------- | -------------------------------------------------- |
| config write keeps the old skills                    | every new config check                             |
| project apply loses `authoritativeScope`             | the drop specs' config checks                      |
| project apply owns every scope                       | the global-skills checks, the masked-entry configs |
| dropped plugin never uninstalled                     | the drop specs' host checks                        |
| switched plugin never uninstalled                    | the plugin→copy host checks                        |
| switch / added plugin never installed                | the copy→plugin and add host checks                |
| copy beside a global plugin uninstalls it            | the beside-global-plugin host checks               |
| scope move uninstalls first                          | the beside-global-copy "nothing is removed" checks |
| working copy kept / global copy deleted              | the copy-gone and global-copy-stays checks         |
| scope move carries a plugin arrival's global copy in | the "project has no local copy" check              |
| switch copies at $HOME / copies nothing              | the local-copy rosters and guards                  |

## What the checks found

**A plugin installed in a project beside its global copy is requested from the host twice.**
`applyMigrations` installs it for the copy→plugin switch, then `applyScopeChanges` →
`migratePluginSkillScopes` asks for the same ref at the same scope. Its eject twin, a copy beside a
global plugin, is not duplicated: `migratePluginSkillScopes` skips eject entries. What a second
`claude plugin install` of an installed plugin does was not measured: a failure there would be
reported as incomplete work. The duplicate is pinned in a spec whose subject it is, marked
`KNOWN GAP`, which reddens when it is fixed. The two specs that drive this path check the install
with `toHaveBeenCalledWith` rather than the whole call list, so they do not pin it.

**A project apply re-renders the global config and registers the project in its `projects`.** A
fixture global written by `renderConfigTs` therefore never survives a byte comparison. The global
side is compared structurally (`skills`).

**`edit --from` addresses a plugin it removes through the installation's marketplace, not the
entry's recorded `origin`.** `uninstall` tries both (`pluginRefsOf` in `commands/uninstall.tsx`).
The display-label spec records an origin of `public` under a `test-fixture` marketplace, and its
host check pins the edit's choice.

## Proposed Standard

No honest static gate exists. Whether a spec changes state depends on what it drives, and the
previous follow-up's block-scanning awk mis-attributed helper code between specs. Mutation testing,
the owner's chosen replacement for coverage floors, does catch this class: before this change, a
config write that kept dropped entries reddened only the one spec CLI-973 had repaired.

Two sentences for `packages/cli/CLAUDE.md` → "ALWAYS verify config AND filesystem":

- Where the plugin host is a module mock, its recorded calls are the plugin side's state: assert
  them exactly, after clearing any setup run's calls.
- A spec named for what a command says is held to this rule too.

Neither conflicts with an existing rule. The census of the sibling files, from `packages/cli` (it
counts lines that read state, not specs that check it):

```
for f in src/cli/lib/__tests__/commands/*says-what-it-did*.test.ts; do printf '%s it=%s state=%s\n' "$f" "$(grep -cE '^\s*it(\.[a-z]+)?\("' "$f")" "$(grep -cE 'readTestTsConfig|loadProjectConfig|configuredSkills|mock\.calls|toHaveBeenCalled|fileExists\(|directoryExists\(|readFile\(|readdir\(' "$f")"; done
```

On 2026-10-24 it gave `compile-says-what-it-did` 23 specs and 0 state lines,
`init-from-plugins-says-what-it-did` 4 and 1, and `init-from-says-what-it-did` 42 and 12.

After CLI-976 repaired those three the same day, it gave 23 and 10, 4 and 11, and 43 and 19. It
undercounts them: they read most of their state through file-local readers (`installedAt`,
`afterCompileAt`, `bothRoots`, `hostCalls`) that the pattern does not match.
