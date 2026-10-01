---
type: standard-gap
severity: medium
affected_files:
  - e2e/fixtures/codex.ts
  - e2e/smoke/codex-lane.smoke.test.ts
  - src/cli/utils/exec.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-09-19
reporting_agent: codex-keeper
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The code half landed with the Codex lane. isCodexCLIAvailable runs its version probe under a
  throwaway pinned HOME, and the lane's smoke spec snapshots the machine's Codex home by path and
  lstat mtime around every test, which the E2E README now names. The standard half has not landed.
  The README's third-party-binary rule still says nothing about a probe being a write, or about a
  leak test run from a temp-dir HOME passing because the write was never made.
---

## What Was Wrong

**Codex 0.155.1 writes into its home every time it starts, before it reads an argument, and
`--version` counts, unless that home is under what Codex treats as the temporary directory.** It
links helper binaries under `$CODEX_HOME/tmp/arg0/codex-arg0<random>`, and each start replaces the
entry the last one left. Under a temp dir it refuses instead, writes nothing, and prints
`WARNING: proceeding, even though we could not create PATH aliases: Refusing to create helper binaries under temporary dir "/tmp"`.

Measured 2026-09-19 against the pinned package (`@openai/codex` 0.155.1, started with Node 23 the
way `e2e/fixtures/codex.ts` starts it), with `HOME` and `CODEX_HOME` pinned to a scratch directory on
every run. Each line is a single run, so a sample of one:

```
# CODEX_HOME under /tmp, created first as runCodex does
env -i PATH=/usr/bin:/bin HOME=<scratch>/tmphome CODEX_HOME=<scratch>/tmphome/.codex \
  node <codex.js> --version
# -> exit 0, the WARNING above, <scratch>/tmphome/.codex still empty

# the same scratch, with TMPDIR moved so Codex does not read it as a temp dir
env -i PATH=/usr/bin:/bin HOME=<scratch>/nontmphome CODEX_HOME=<scratch>/nontmphome/.codex \
  TMPDIR=<scratch>/othertmp node <codex.js> --version
# -> exit 0, no warning, wrote .codex/tmp/arg0/codex-arg021LQgy

# the same command again
# -> codex-arg021LQgy gone, codex-arg0vglgA5 in its place; tmp/ kept its mtime, arg0/ moved
```

With `HOME` and `CODEX_HOME` pointed at two different scratch directories, a refused
`plugin marketplace add` wrote `.tmp/marketplaces` under `CODEX_HOME` and nothing under `HOME`. So
`CODEX_HOME` decides where Codex writes, and pinning `HOME` alone isolates nothing.

This machine already holds a write from an unpinned start: `~/.codex/tmp/arg0/codex-arg0NlL9wO`,
dated `2026-09-19 21:03:06 +0200` (read with `stat`, not opened). The process that wrote it is not
known. The Step 0 lane reports its first Codex run at about 21:31 that evening and offers that as
evidence the write came before this work. That timing is inherited, not re-derived.

This has two consequences for the suite's rule that a spec spawning a third-party binary pins where
that binary keeps its state (`standards/e2e/README.md`):

1. **An availability probe is a write, so it is a spawn door like any other.**
   `isClaudeCLIAvailable` in `src/cli/utils/exec.ts` runs `claude --version` with no state pinned.
   That is harmless for Claude: Claude Code 2.1.278's `--version` wrote nothing under a pinned scratch
   `HOME` and `CLAUDE_CONFIG_DIR`, measured the same way with `TMPDIR` moved (a sample of one). The
   same shape for Codex writes the real `~/.codex` on every suite run on any machine whose home is
   not a temp dir, which is every developer machine.
2. **A leak test whose HOME is under the temp dir cannot see this leak, and a listing of names can
   miss it wherever the HOME is.** Under `/tmp` the write never happens, so the test passes because
   the location turned off the thing it guards against. Outside `/tmp`, each start replaces the
   `arg0` entry. A listing that stops above `tmp/arg0/` therefore returns the same names before and
   after, and only `arg0`'s mtime shows the change. The smoke-spec lane's mutation runs (inherited,
   and a sample of two) had the fixture handing Codex no `HOME`/`CODEX_HOME`. With `TMPDIR` moved,
   4 of 4 tests went red. With the scratch HOME left under the temp dir, 2 of 4 did.

## Fix Applied

None in this pass. This was discovery and re-derivation only. The Codex lane already carries both
fixes:

- `isCodexCLIAvailable` in `e2e/fixtures/codex.ts` runs `--version` under a throwaway HOME, through
  `startPinned`, the one place that module starts the binary.
- `e2e/smoke/codex-lane.smoke.test.ts` snapshots the machine's `~/.codex` in the `beforeEach` and
  `afterEach` of every test, recording each entry's path and `lstat` mtime
  (`modificationTimesUnder`).

The `isCodexCLIAvailable` JSDoc says Codex "writes on EVERY start". The runs above narrow that: every
start outside the temp dir. `--version` under a `/tmp` home writes nothing.

## Proposed Standard

In `.ai-docs/standards/e2e/README.md`, the paragraph beginning "A spec that spawns a third-party
binary must pin where THAT binary keeps its state" should gain two sentences after the one naming
`e2e/smoke/codex-lane.smoke.test.ts`. This is a proposal, not landed text:

> A probe counts: any start of such a binary, `--version` included, runs with its state pinned
> unless that binary has been measured not to write on it, and Codex writes on every start. A leak
> test for such a binary runs it from a HOME the binary does not treat as temporary (move `TMPDIR`),
> or the test passes because the location switched the write off.

Checked against `CLAUDE.md`'s NEVER/ALWAYS rules and the README's three existing obligations for
third-party binaries. It conflicts with neither, and it extends the first obligation ("pin the
binary's own state variable explicitly") to calls that are not the spec's subject.
