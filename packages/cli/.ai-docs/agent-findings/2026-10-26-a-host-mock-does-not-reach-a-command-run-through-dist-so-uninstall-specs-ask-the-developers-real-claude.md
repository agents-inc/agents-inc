---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/lib/__tests__/commands/uninstall.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/init-from-says-what-it-did.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-26
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  Both spec files now put a logging claude first on PATH for every spec (useClaudeStub in
  __tests__/helpers/claude-stub.ts). init-from-says-what-it-did.test.ts's three held-skill specs
  assert nothing in Claude's setup changed, and its pair asserts the marketplace add and then the
  install. uninstall.test.ts's six plugin specs assert the uninstall at both scopes, in either
  order, and two specs holding no plugin assert nothing in Claude's setup changed. Each reads the
  stub's changes(), which leaves out the version check and the marketplace listing. Pending: the
  CLAUDE.md sentence and the refusing claude for the unit projects, both proposed below, are not
  written.
---

## What Was Wrong

`runCliCommand` runs oclif, which loads `./dist/commands` through a native `import()`, so a
`vi.mock` of a source module never reaches those runs. The 2026-10-23 giget finding measured the
same for a dependency. The Claude host spawns its CLI by name (`execCommand("claude", …)` in
`utils/exec.ts`), so a dist run that reaches the host spawns whichever `claude` PATH finds first.
On a developer's machine that is the real Claude Code CLI.

**`init-from-says-what-it-did.test.ts` had no host mock at all.** Three of its specs serve a
global plugin skill that the global install already holds, and only that skip kept the run away
from the host. Measured on 2026-10-26 with a logging `claude` and `codex` first on PATH and the
skip broken in `dist/` as it loads (two mutants: no global install read; held entry neither
substituted nor skipped). Under each mutant, each of the three specs spawned
`plugin marketplace list --json`, `plugin marketplace add <marketplace dir>` and
`plugin install test-fixture-api-framework-hono@test-fixture --scope user`. Under the second
mutant, "names a global skill it kept as installed, and no sub-agent when each is restated" stayed
green while doing so.

**`uninstall.test.ts` mocks `../../hosts/host-for.js`, and its `runCliCommand` specs run past the
mock.** (Its `Uninstall.run` specs import from source and do reach it.) The census ran every spec
file that calls `runCliCommand(`, with the same logging `claude` and `codex` first on PATH. It is a
census of those files, not a sample:

```
grep -rl "runCliCommand(" src scripts --include="*.test.ts" --include="*.test.tsx"
```

`uninstall.test.ts` was the only file that spawned either binary today, with 18 calls to `claude`:
six runs, each asking `--version`, then `plugin uninstall test-plugin@marketplace --scope project`,
then the same with `--scope user`. When the stand-in answered success, four of its specs failed on
`NOTHING_REGISTERED_TO_COUNT`:

- "should remove plugin directory"
- "should match plugin keys using marketplace fallback when skill source differs"
- "should uninstall project-scoped plugin that was re-scoped from global during init"
- "should remove both plugins and CLI-managed local artifacts"

They pass only because the real `claude` answers that nothing is installed. The census cannot
count a spec that reaches the host only under conditions it did not create, as
`init-from-says-what-it-did`'s three did.

## Fix Applied

`init-from-says-what-it-did.test.ts` only, which was the row in scope. `useClaudeStub()`
(`__tests__/helpers/claude-stub.ts`, with its own spec) runs for every spec in the file. It puts a
`claude` first on PATH that logs each call's arguments and answers as a Claude with nothing
installed. The three held-skill specs assert `claude.calls()` is empty. A new spec pins the
allowed half in the same file: with no global install, the same payload installs Hono through
exactly those three calls. Red evidence: both skip mutants fail the three specs on the no-call
assertion, and no call reached a `claude` further down PATH. A mutant that installs no plugin fails
the new spec. A helper mutant that appends the stub instead of prepending it fails the helper spec
and the new spec. `uninstall.test.ts` is outside the lane and unchanged.

## Proposed Standard

Add to `packages/cli/CLAUDE.md` § Test Data, beside the `standAtTerminal` rule:

> NEVER rely on a `vi.mock` of a source module in a spec that runs a command through
> `runCliCommand`. oclif loads `dist/` with a native `import()`, so the mock is inert there and the
> run reaches whatever the unmocked module reaches; for the plugin host that is the developer's
> own `claude`. Put `useClaudeStub()` in the file, or run the command from source with the host
> mocked. `edit-from-plugins-says-what-it-did.test.ts` shows the second shape.

This is the host half of the giget finding's unlanded proposal ("`vi.mock` of a dependency is inert
there"). The two would read best as one sentence, and no conflict with CLAUDE.md was found. A
stronger gate holds the whole class rather than one file: a `setupFiles` entry for the unit
projects that puts a refusing `claude` and `codex` first on PATH, so any spec that spawns one
without its own stub fails by name. By today's census only `uninstall.test.ts` would redden.

## Correction

2026-10-26, CLI-989. Two claims above no longer hold. The stand-in did not answer as a Claude
with nothing installed: it answered every request with success, `plugin uninstall` included, and
the Claude host reads that as "removed". It now answers a plugin uninstall with exit 1 and the
words Claude Code 2.1.310 used for each of the six specs' calls when they were passed through to
the real CLI: `✘ Failed to uninstall plugin "<ref>": Plugin "<ref>" not found in installed
plugins`. And `uninstall.test.ts` is no longer unchanged: the stand-in runs for every spec in it.
A logging `claude` behind the stand-in, rerun over that file, saw no call. That census covered
`uninstall.test.ts` only, so "only `uninstall.test.ts` would redden" was not re-checked across the
other files. The body above is left as written.

2026-10-26, CLI-989 fix round. The allowed-half spec no longer installs Hono "through exactly
those three calls". It asserts the two that change Claude's setup, `plugin marketplace add <dir>`
then `plugin install … --scope user`, and leaves out the `plugin marketplace list --json` probe.
The six uninstall specs no longer assert the `--version` check or which scope is swept first. A
review reddened both lists with refactors no user can see: reading registration from Claude's
registry file, finding `claude` on PATH instead of running `--version`, and sweeping the scopes in
reverse.

2026-10-26, CLI-989 fix round 2. The three held-skill specs no longer assert `claude.calls()` is
empty, as Fix Applied says. They and the two uninstall specs holding no plugin assert
`claude.changes()` is empty. An empty `calls()` pinned the `--version` check, which no user sees: a
review reddened the three with init asking whether Claude is there before it found no plugin to
install, and the two with uninstall asking the same where it planned no plugin. Both skip mutants
still redden the three, now on `plugin marketplace add <dir>` and `plugin install … --scope user`.
