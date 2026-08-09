---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/__tests__/commands/init-from-plugin-install.test.ts
  - src/cli/lib/__tests__/commands/eject.test.ts
  - src/cli/lib/__tests__/commands/init.test.ts
  - src/cli/lib/__tests__/commands/uninstall.test.ts
  - src/cli/lib/__tests__/commands/update.test.ts
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
date: 2026-08-06
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  init-from-plugin-install.test.ts now stubs HOME, because the greenfield check made its exposure
  load-bearing. The other command specs are untouched and the convention is unwritten.
---

## What Was Wrong

The `commands` vitest project runs oclif commands **in process** — `runCliCommand` / `Command.run`,
with `process.chdir()` into a temp directory. `cwd` is isolated that way. `HOME` is not.

Several modules those commands reach reads `os.homedir()` at runtime, by design:

- `lib/installation/install-base-dir.ts` — `installBaseDir(projectDir, "global")` IS `os.homedir()`
- `lib/installation/installation.ts` — `detectGlobalInstallation()`
- `lib/configuration/config-writer.ts` — the global `.claude-src` path
- `commands/eject.ts` — `--output ~/...` expansion

So an in-process command spec with a temp `cwd` and no `HOME` of its own reads, writes and detects
against **the developer's own `~/.claude`**. Nothing declares that it must not.

Before this change the exposure was latent: no spec in that project happened to drive a homedir read
whose result changed an assertion. `init --from` becoming greenfield-only added one —
`refuseBlockingGlobalInstall` calls `detectGlobalInstallation()` — and
`init-from-plugin-install.test.ts` publishes a payload with a global-scoped skill. On any machine
with a global install (which is most machines that develop this CLI), that spec would have been
refused by the developer's own installation and failed for a reason that has nothing to do with what
it tests. It would also have passed on CI, where HOME is empty.

`grep -rln 'stubEnv("HOME"' src/cli/lib/__tests__/commands/` returned exactly one file after the
fix, and zero before it. The e2e suite has no such gap — `CLI.run` sets `HOME` on every spawn, and
`createTestEnvironment` exists to hand it a fake one — so the convention is established in one half
of the test surface and unwritten in the other.

## Fix Applied

`vi.stubEnv("HOME", tempDir)` in `init-from-plugin-install.test.ts`'s `beforeEach`, with
`vi.unstubAllEnvs()` alongside the existing `vi.unstubAllGlobals()`, and a comment naming the reason.
Scoped to the one spec whose behaviour depends on it; the rest of the project is unchanged.

## Proposed Standard

Write into `.ai-docs/standards/e2e/test-data.md` (or a `standards/unit/` sibling, which does not yet
exist) the rule the e2e half already follows:

> **An in-process command spec owns its `HOME`, not just its `cwd`.** `process.chdir()` isolates one
> of the two roots the CLI writes to. Any spec that runs a command through `runCliCommand` /
> `Command.run` must `vi.stubEnv("HOME", <temp dir>)` and `vi.unstubAllEnvs()` after, whether or not
> the path under test reads it today — the scope system means any command may start to.

Worth considering as enforcement rather than prose: a shared `beforeEach` in a helper that every
`__tests__/commands/` spec calls, so the isolation is not something each new spec has to remember.
That is a larger change than this finding's scope and should be its own tracker row.

The reason to prefer a rule over case-by-case fixes is the failure mode: a spec that reads the real
HOME does not fail loudly and consistently. It passes on CI, passes on a clean machine, and fails
only for the developer who has the CLI installed — which reads as flake rather than as the
deterministic environment dependency it is.
