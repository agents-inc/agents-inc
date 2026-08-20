---
type: architectural-drift
severity: low
affected_files:
  - src/cli/commands/init.tsx
standards_docs:
  - .ai-docs/reference/commands/index.md
date: 2026-08-09
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  Proposed standard 1 landed: reference/commands/index.md now states that the divert makes the
  wizard's hydration branch unreachable and that `edit` is what hydrates a saved roster. Still
  outstanding: the dead branch itself in init.tsx, and the guards rule for standards/.
---

## What Was Wrong

`init`'s interactive producer reads the global config and hydrates the wizard from it:

```ts
const [{ sourceResult, startupMessages }, globalConfig] = await Promise.all([
  this.loadSourceOrFail(flags),
  this.loadGlobalConfigIfExists(),
]);
...
return runWizardSession({
  hydrate: {
    ...(globalSkills !== undefined && {
      installedSkillIds: globalSkills.map((s) => s.id),
      installedSkillConfigs: globalSkills,
    }),
```

That branch cannot be taken. `globalConfig` is non-null only when `detectGlobalInstallation()`
finds an install — and `run()` calls `showDashboardIfInitialized(projectDir)` first, which goes
through `detectInstallation(projectDir)`, whose step 2 is the SAME
`detectGlobalInstallation()`. Whenever there is a global install to hydrate from, the dashboard
is shown and `run()` returns before `selectionFromWizard` is reached. `selectionFromWizard`
therefore only ever runs with `globalConfig === null`, and every `globalSkills` / `selectedAgents`
line downstream of it is dead.

Confirmed by hand rather than by reading: a scratch `HOME` carrying
`~/.claude-src/config.ts` + `~/.claude/skills/<skill>/`, and `init` run in an empty project
directory against it, prints the dashboard and exits — the wizard never mounts.

The user journey the code was written for is real and still works; it just does not go through
`init`'s wizard. `init` in an installed directory shows the dashboard, whose Edit entry runs
`edit --project-setup` — so the saved roster is hydrated by `edit`, which reads it from the
project config and inlines the global one.

Found while wiring CLI-456's refusal into "both the init-with-existing and edit paths". The edit
path is live and covered; the init call site was removed again once it was shown it could not
fire, rather than shipped as a guard nobody could reach or test.

## Fix Applied

None to the dead branch — deleting `loadGlobalConfigIfExists` and its hydration is a scope
decision for the command's owner, not a side effect of an unrelated task. What was fixed is the
mistake it nearly caused: the CLI-456 refusal now lives only on `BaseCommand`
(`ensureSavedSkillsReadable`) and is called from `edit`, the one command that can meet a saved
roster.

## Proposed Standard

Two things, both small:

1. **Record the divert in the command's reference page** — done, in
   `.ai-docs/reference/commands/index.md` (there is no `commands/init.md`; `index.md` is the
   canonical body). The page had described the wizard as `init`'s main path with nothing saying
   that an existing installation — project OR global — sends the whole flow to the dashboard, so a
   reader adding behaviour "for init with an existing install" could not tell that `edit` is where
   it belongs.

2. **A rule for guards, in `.ai-docs/standards/` alongside the other command conventions:** a
   pre-flight guard belongs at the point that can meet the state it guards, and its reachability
   is something to establish by running the command, not by reading the call site. This one read
   as obviously correct — the hydration it protected is sitting three lines below it.
