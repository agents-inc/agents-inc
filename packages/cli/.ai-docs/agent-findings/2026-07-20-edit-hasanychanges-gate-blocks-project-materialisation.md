---
type: architectural-drift
severity: high
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/commands/init.tsx
  - src/cli/lib/installation/local-installer.ts
  - e2e/lifecycle/project-tracking-propagation.e2e.test.ts
  - e2e/fixtures/dual-scope-helpers.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-07-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: "Gate replaced with an explicit intent signal — `init`'s dashboard flow passes the hidden `--project-setup` flag to Edit, which materialises on a no-op only when that flag is set and cwd is not the home root. The recommended `installation.projectDir !== cwd` shape was NOT adopted (see Resolution). All 5 project-tracking tests pass with assertions unchanged; the general rule is standards/clean-code-standards.md § 18.3."
---

## What Was Wrong

`cc edit` decides whether to persist ANYTHING by asking one question: did the roster change?

```ts
// src/cli/commands/edit.tsx, run()
if (!hasAnyChanges(changes)) {
  this.log(chalk.hex(CLI_COLORS.NEUTRAL)("No changes made."));
  return;
}
```

Everything after that line is skipped, including `writeConfigAndCompile()` → `writeProjectConfig()` →
`writeScopedConfigs()`, which is the ONLY code path that

- writes `<project>/.claude-src/config.ts` and `config-types.ts`, and
- calls `registerProjectPath()` to add the project to the global config's `projects[]`.

That gate is correct for an already-initialised project. It is wrong for the **dashboard → Edit**
flow, which is how a project gets initialised whenever a real global install already exists:
`cc init` in a project with no config of its own detects the global installation through
`detectInstallation`'s project→global fallback, shows the dashboard, and delegates to `cc edit`
(`runDashboardFlow` in `init.tsx`; helper `initProjectAllGlobal` in `e2e/fixtures/dual-scope-helpers.ts`).

In that flow `context.projectConfig` is the **global** config, so "no change" means "this project
wants exactly what global already provides" — a completely ordinary outcome. The command then exits
0, prints "No changes made.", and the project is never materialised or registered.

Nothing pinned this, because a delta always happened to exist. A project-context edit used to leave
inherited global-active entries verbatim (`mergeGlobalConfigs` keeps `existing` entries), so a
global-scope source switch driven from a project was never recorded in `~/.claude-src/config.ts`.
The `initProjectAllGlobal` helper does `setAllLocal()`, so the second and later projects always saw
`marketplace → eject` as a pending source change and fell through the gate by accident.

Recording that switch (the new `recordGlobalSourceMigrations` in `edit.tsx`, pinned by
`e2e/lifecycle/project-edit-global-source-switch-divergence.e2e.test.ts`) is the right fix for
config/disk divergence — but it removes the accidental delta. The second project's edit now genuinely
has nothing to change, hits the gate, and writes nothing. Five tests in
`e2e/lifecycle/project-tracking-propagation.e2e.test.ts` fail as a result: the global config never
gains `"projects"` entries for the later projects and `<project>/.claude-src/config-types.ts` is
never created.

Verified empirically: with the global config's `source` fields patched back to the marketplace value
(the pre-`recordGlobalSourceMigrations` state) the same second-project flow writes the project config
and registers the path; with the recorded `eject` sources it prints "No changes made." and writes
nothing.

## Fix Applied

None — discovery only. The gate lives in `edit.tsx`, which is owned by a different agent this round.

Recommended shape: the no-op short circuit must not fire when `cc edit` is operating on an
**inherited** baseline, i.e. when the current directory has no `config.ts` of its own.
`EditContext.installation.projectDir` already encodes exactly that — `detectInstallationInDir`
returns the directory whose `config.ts` it found, so `context.installation.projectDir !== cwd`
means "using the global fallback".

```ts
// Materialising an inherited baseline into a real project config IS the change.
const inheritsGlobalBaseline = context.installation.projectDir !== cwd;
if (!hasAnyChanges(changes) && !inheritsGlobalBaseline) {
  this.log(chalk.hex(CLI_COLORS.NEUTRAL)("No changes made."));
  return;
}
```

Note this is not a test-only concern: without it, a user with a global install cannot initialise a
new project at all unless they happen to change something in the wizard.

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md` (new "Early-Return Guards Over Persistence"
section), and cross-reference from `.ai-docs/reference/commands/edit.md`:

> An early return that skips a command's entire persistence phase must be justified against every
> caller of that command, not just the one the guard was written for. Before adding or keeping a
> `if (nothingChanged) return;` guard, enumerate the command's entry points (direct CLI invocation,
> `config.runCommand` delegation from another command, dashboard routing) and state for each one
> what on-disk artefacts the guard suppresses. When a command is reachable as the _materialisation_
> step of another flow, "no delta" is not the same as "nothing to do".

Second rule, for `.ai-docs/standards/e2e/anti-patterns.md`:

> An E2E setup helper must not depend on an incidental delta to drive the flow it is setting up.
> `initProjectAllGlobal` reached `writeProjectConfig` only because `setAllLocal()` happened to
> produce a source change that the config layer had not yet learned to record. Helpers that
> "initialise" state should assert the artefact they claim to create (here: the project `config.ts`)
> so the day the incidental delta disappears the helper fails loudly instead of silently
> establishing nothing.

## Resolution (2026-07-20)

The "Early-Return Guards Over Persistence" standard above was adopted. The **recommended code shape
was not**, and future readers should not reach for it:

```ts
// REJECTED — fires for bare `cc edit` too
const inheritsGlobalBaseline = context.installation.projectDir !== cwd;
```

`installation.projectDir !== cwd` is true for _any_ project-context run against a global-only
install, including a bare `cc edit` that the user opened purely to look around. Adopting it makes an
inspection materialise and register the project, which breaks
`edit-global-fallback.e2e.test.ts` → "edit with global fallback preserves global skills"
(`toStrictEqual` on the global config). That is the same state-derived inference the sibling finding
records as the root cause — a different incidental signal, not an explicit trigger.

What landed instead: `cc init`'s dashboard flow tells Edit _why_ it was invoked. `runDashboardFlow`
takes a `DashboardOrigin` (`"init"` from `Init.run`, `"standalone"` from the bare-`cc` init hook) and
appends `--project-setup` to the `config.runCommand` argv only for an init-originated Edit. Edit
gates materialisation on `flags[EDIT_PROJECT_SETUP_FLAG] && !isHomeDirectory(cwd)`. Both conflicting
suites pass with every assertion intact.
