---
type: missing-standard
severity: high
affected_files:
  - src/cli/utils/exec.ts
  - e2e/helpers/test-utils.ts
  - e2e/fixtures/cli.ts
  - e2e/smoke/home-isolation.smoke.test.ts
  - e2e/smoke/plugin-install.smoke.test.ts
  - e2e/smoke/plugin-chain-poc.smoke.test.ts
  - e2e/commands/plugin-uninstall-core.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-17
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: >-
  The code fix has landed (config dir threaded through every `claudePlugin*` helper, allocated
  per run by the e2e fixtures, guarded by a rewritten smoke spec). The Proposed Standard below
  is not yet written into `standards/e2e/`.
---

## What Was Wrong

Every rule the suite has about isolation is about OUR state — a fake HOME, a temp project, a
temp source. Nothing said anything about the state a THIRD-PARTY binary keeps, and the suite
spawns one: `claude`.

Three specs called `claudePluginMarketplaceAdd` / `claudePluginInstall` **in the vitest worker
process**, which inherits the developer's real `HOME`. `claudePluginMarketplaceAdd` reached
`execCommand("claude", args, {})` with no cwd and no env, so those registrations landed in
`~/.claude/plugins/known_marketplaces.json` on the machine running the suite, pointing at temp
directories the same specs then deleted. `cleanupFixture` removes the temp tree, not the
registration.

The mechanism to prevent it already existed and appeared nowhere in `src`, `e2e` or `.ai-docs`:
`CLAUDE_CONFIG_DIR` redirects the Claude CLI's entire config tree. Measured against Claude Code
2.1.231, it isolates **writes**, not only reads — a `marketplace add` under an isolated dir wrote
`settings.json`, `plugins/known_marketplaces.json`, `plugins/installed_plugins.json` and
`.claude.json` inside that dir, and the real config's files stayed byte-identical. It also
**beats `HOME`**: with both set to different directories, the fake HOME stayed completely empty.
That last fact makes it more than a convenience — an exported `CLAUDE_CONFIG_DIR` on a
developer's machine silently overrides every fake HOME in the suite.

`e2e/smoke/home-isolation.smoke.test.ts` existed to settle exactly this question and could not.
Every assertion in it was `expect(typeof result.exitCode).toBe("number")`, which passes on a
crash, on an auth refusal, and on a write into the real config. Its own header said the answer
would decide whether plugin E2E must use the real HOME. The question was asked, a test that
could not answer it was written, and no conclusion was ever reached — for long enough that two
other specs wrote "we use the REAL HOME because that blocker is unresolved" into their headers
and inherited the leak.

**The vacuity was load-bearing, not cosmetic.** `plugin-install.smoke.test.ts` wrote its
marketplace manifest as an untyped `{ name, plugins: [] }` literal. The Claude CLI rejects that
shape — `owner: Invalid input: expected object, received undefined` — so the test named "should
add a marketplace from a local directory source" had never once added a marketplace. Only
`expect(typeof result.exitCode).toBe("number")` stood between that and a red run.

## Fix Applied

- `ClaudeConfigOptions` (`{ configDir?: string }`) threaded through all eight config-touching
  `claudePlugin*` helpers in `src/cli/utils/exec.ts`, via one `configDirEnv()` that returns the
  `execCommand` options fragment. Optional, so no production call site changes.
  `isClaudeCLIAvailable` is deliberately excluded — `claude --version` reads no config.
- `createIsolatedClaudeHome()` in `e2e/helpers/test-utils.ts` allocates a fake HOME and names
  `<home>/.claude` beside it — the directory that HOME already implies, and the same one our own
  `getUserPluginsDir()` resolves to under that HOME, so both binaries see one installation.
  Cleanup is the existing `cleanupTempDir(home)`: the registry files live inside the tree, so a
  registration cannot outlive the run.
- `CLI.run` and `runCLI` pin `CLAUDE_CONFIG_DIR` to the effective HOME's `.claude`, deriving it
  after `options.env` is applied. Same reasoning already written into `CLI.run` for
  `CC_MARKETPLACE`, applied to the Claude CLI's own override.
- `home-isolation.smoke.test.ts` rewritten to assert the isolation: each claim is read back out
  of the config tree the invocation wrote to, and paired with the machine's own marketplace list
  being `toStrictEqual` to how the run found it. Mutation-checked — with `configDirEnv` neutered,
  6 of its 7 tests go red, each for the reason its name claims.
- The manifest literal is now typed `Marketplace`, so a missing required field is a compile error.

## Proposed Standard

Add to `standards/e2e/README.md` § Critical Rules, beside "State-change verification":

**A spec that spawns a third-party binary must pin where that binary keeps its state.** Isolating
`HOME` is not sufficient and is not always what the binary reads: the Claude CLI's
`CLAUDE_CONFIG_DIR` overrides `HOME` outright, so a suite that only fakes `HOME` is isolated
exactly until a developer exports one. Pin the binary's own state variable explicitly, derive it
from the fake HOME so our CLI and the third-party binary agree, and allocate it inside the temp
tree so cleanup removes the state rather than merely the fixture. A helper that shells out to
such a binary must accept that location as a parameter — an in-process caller has no spawned
environment to inherit, and reading it ambiently makes the isolation invisible at the call site.

Add to `standards/e2e/anti-patterns.md` § Weak Assertions:

**`expect(typeof x).toBe("number")` is not an assertion.** It passes on a crash, on a refusal and
on a write to the wrong machine. Where a spec genuinely cannot predict an outcome, that is
evidence the spec is not isolated enough to have one — fix the isolation, then assert the
outcome. A test whose header states an open question is a defect report, and the question must
be answered before the file is called a test.
