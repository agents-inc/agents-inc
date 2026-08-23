---
type: architectural-drift
severity: high
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/lib/operations/project/write-project-config.ts
  - src/cli/lib/operations/project/compile-agents-all-scopes.ts
standards_docs:
  - .ai-docs/reference/commands/edit.md
  - .ai-docs/reference/concepts/scope-system.md
date: 2026-08-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  `resolveEditRoot` in `src/cli/commands/edit.tsx` answers the question once and returns an
  `EditRoot` every layer takes as a parameter; `isHomeDirectory(`, `process.cwd()` and
  `os.homedir()` are each pinned to one site in that file by
  `src/cli/lib/__tests__/edit-decides-scope-once.test.ts`, and the behaviour by
  `e2e/lifecycle/edit-outside-an-install-edits-the-global-one.e2e.test.ts`.
---

## What Was Wrong

`edit` threaded TWO directories. `installation.projectDir` — the root of the installation
`detectProject` actually found — was used for reads, and `process.cwd()` for every write. Six
layers then answered "am I editing the global installation?" for themselves, three of them off
`cwd`:

| Layer                              | Criterion it used         |
| ---------------------------------- | ------------------------- |
| `runEditWizard` (the scope toggle) | `isHomeDirectory(cwd)`    |
| `writeConfigAndCompile`            | `cwd` (via the two below) |
| `writeProjectConfig`               | `!isHomeDirectory(cwd)`   |
| `discoverAllPluginSkills`          | `installation.projectDir` |
| `discoverInstalledSkills`          | `cwd`                     |
| plugin install / uninstall         | `cwd`                     |

Run `edit` from any directory that holds no installation of its own, over a global-only install,
and the command disagreed with itself. The wizard offered the project/global scope toggle for a
project that did not exist. `writeProjectConfig` read the working directory as a project context,
so it wrote a `.claude-src/config.ts` + `config-types.ts` pair into whatever unrelated checkout the
command had been started in, and `compileAgentsAllScopes` split into two passes over the same
directory. Plugins were registered against it too.

**The two rows an audit of 2026-04-22 got wrong are worth recording, because a table nobody
re-derives is how six criteria become seven.** Row 5 read "`discoverInstalledSkills` uses `cwd` —
misses global plugins": the first half held, the second had not been true for a long time — that
function's first two steps are `discoverAllPluginSkills(os.homedir())` and
`discoverLocalProjectSkills(GLOBAL_INSTALL_ROOT)`, so it merges both scopes and misses nothing. And
row 1 read `cwd === GLOBAL_INSTALL_ROOT`, which names the module-load-time constant; the code called
`isHomeDirectory(cwd)`, which resolves `os.homedir()` at runtime and compares real paths. Neither
error changed the verdict, and both would have changed the fix.

## Fix Applied

`resolveEditRoot(installation, cwd, setupRequested)` returns `EditRoot`
(`{ dir, isGlobal, isProjectSetup }`), and every layer below takes that value as a parameter in
place of the `cwd: string` it used to take. `dir` is `installation.projectDir` — the only root with
a config to edit, and therefore the only root the run may write to.

`--project-setup` is an instance of that rule rather than an exception to it: `cc init` run in a
directory declares that directory the installation being set up, so the root is `cwd` there and the
config the run writes is what makes the claim true. At the home root the two spellings name the same
directory, which is why the flag alone picks the root and the resolved criterion decides whether
anything is materialised.

## Proposed Standard

**Where a command's behaviour turns on WHICH directory it is acting on, resolve it once into a named
value and pass that value down. Never pass a bare path to a layer that will decide for itself.** Six
behavioural assertions would have caught the arrangement above; none of them would catch the seventh
layer, and the seventh layer is what a rule has to hold.

The mechanical form the fix takes is worth copying, because it is what makes the class testable:
the resolver is the ONLY site in the file that may call the deciding helper, and a spec counts it.
`src/cli/lib/__tests__/edit-decides-scope-once.test.ts` pins `isHomeDirectory(`, `process.cwd()` and
`os.homedir()` at one occurrence each in `edit.tsx`. A layer that invents its own criterion has to
reach for one of the three, and each reddens. That gate is deliberately a raw count over the source
rather than a behavioural check: the property is about the shape of the command, and no run can
observe a criterion a layer has not yet been given a reason to disagree about.

Suggested home: `.ai-docs/standards/clean-code-standards.md`, beside the existing rules on
canonicalising in one place. `.ai-docs/reference/concepts/scope-system.md` now carries the
`edit`-specific statement under "How `isEditingFromGlobalScope` is computed", and
`.ai-docs/reference/commands/edit.md` carries it as an invariant ("One directory, decided once").

**And the audit-table half, which is the smaller rule and the one that nearly cost more:** a
finding's table of current behaviour is evidence with a date on it, not a specification. Two of its
six rows had rotted in four months. Re-derive every row against source before acting on any of
them, and report the ones that no longer hold — a row that has drifted the OTHER way (a defect since
fixed) is the one that sends a fix at something already correct.
