---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/__tests__/helpers/isolated-home.ts
  - src/cli/consts.ts
  - src/cli/lib/loading/source-fetcher.ts
  - src/cli/lib/configuration/config-types-writer.ts
  - src/cli/lib/operations/skills/discover-skills.ts
  - vitest.setup.ts
  - src/cli/lib/__tests__/commands/init-edit-validation-parity.test.ts
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
date: 2026-08-21
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: premise-expired
status: resolved
resolved_by: >-
  All three halves are closed. The detached-writer door was shut in `isolated-home.ts` in this
  finding's own pass. The frozen constants became functions on 2026-08-22 — `CACHE_DIR` is
  `cacheRoot()` and `GLOBAL_INSTALL_ROOT` is `globalInstallRoot()`, with their four product readers
  updated and the `Object.defineProperty(consts, …)` workarounds in two large specs deleted. The
  `beforeAll` spy in `vitest.setup.ts` moved to `beforeEach`. This finding's own proposed grep is
  now a spec-gate, `src/cli/lib/__tests__/home-dir-read-at-call-time.test.ts`, which reads the
  DECLARATION shape across `src/cli/` and was proved against a planted violation before being
  trusted. One consequence is filed separately as
  `2026-08-22-a-spec-was-green-because-a-mock-split-one-path-into-a-writer-and-a-reader.md`.
---

# A fake HOME is not isolation while a frozen constant and a detached child both outlive it

## What Was Wrong

`setupIsolatedHome` promises a temp tree that `cleanup` removes. Two things reach into that tree
from outside the promise, and both fail as a PASS.

### 1. A constant computed at module load freezes to whichever test ran first

`src/cli/consts.ts` computes two paths at import time:

```
export const GLOBAL_INSTALL_ROOT = os.homedir();
export const CACHE_DIR = path.join(os.homedir(), ".cache", DEFAULT_PLUGIN_NAME);
```

`runCliCommand` drives oclif through `./dist/commands` (package.json -> `oclif.commands.target`), a
SECOND module graph, first imported when a test runs its first command. So both constants take the
value of that test's fake home and keep it for the whole file. Reproduced directly — two tests, each
with its own `setupIsolatedHome`, reading `CACHE_DIR` out of the dist chunk that declares it:

```
PROBE2-1 fakeHome: /tmp/cc-probe2-bcjfJb/fakehome CACHE_DIR: /tmp/cc-probe2-bcjfJb/fakehome/.cache/agents-inc
PROBE2-2 fakeHome: /tmp/cc-probe2-a9OqOP/fakehome CACHE_DIR: /tmp/cc-probe2-bcjfJb/fakehome/.cache/agents-inc
```

`getCacheDir` in `src/cli/lib/loading/source-fetcher.ts` is `CACHE_DIR`'s only product reader, so
every later marketplace fetch in that file `ensureDir`s a directory the first test's `afterEach`
already deleted, downloads into it, and hands the caller a `sourcePath` under one temp tree while
the destination is under another. That is the reported symptom exactly: 150 source paths under
`/tmp/cc-eject-test-D20V1J`, the destination under `/tmp/cc-eject-test-RXdfy1`, both produced by one
`beforeEach`.

`GLOBAL_INSTALL_ROOT` is the same shape with two product readers (`config-types-writer.ts`,
`operations/skills/discover-skills.ts`). Three comments in `src/` already call it out as a latent
test-mock bug and two large specs work around it with `Object.defineProperty(consts, …)`.

### 2. A detached third-party child recreates the tree after cleanup

`@oclif/plugin-warn-if-update-available`'s init hook ends in

```
spawn(process.execPath, [versionScript, …], { detached: !config.windows, stdio: "ignore" }).unref();
```

and `get-version.js` opens with `await mkdir(dirname(file), { recursive: true })`. The child
outlives the test that started it, so it recreates `<fakeHome>/.cache/agents-inc/` after `cleanup`
has removed the tree — and its `mkdir` landing inside a running recursive remove is the other side
of the `ENOTEMPTY: rmdir` this suite reports. Every `setupIsolatedHome` / `useFakeHome` prefix in
the suite is represented in the wreckage on the machine this was found on.

Measured on one file, `commands/eject.test.ts`, `find /tmp -maxdepth 1 -name 'cc-eject-test-*'
-newermt "@$MARK"` after each run: **26** leaked directories, **0** with the door closed, and **1**
with the door closed and the frozen `CACHE_DIR` still in play — that last one holding a full clone
of the marketplace, which is carrier 1 isolated.

### 3. The premise that made the helper's own JSDoc wrong

The helper's JSDoc said the env var does not reach `os.homedir()` and that every such path needs its
own spy. That was true when written and is not now: `vitest.setup.ts` installs a process-wide
`vi.spyOn(os, "homedir")` answering with `process.env.HOME`. What it does not survive is
`vi.restoreAllMocks()`, which is registered in a `beforeAll` and so is removed for every later test
in any file that restores mocks:

```
PROBE-A isMock: true  value: /tmp/vitest-home-NZYQ2M
PROBE-B homedir: /tmp/probe-fake-home
PROBE-C isMock: false homedir: /tmp/probe-fake-home   <- after vi.restoreAllMocks()
PROBE-D isMock: false homedir: /tmp/probe-fake-home
```

That is the mechanism behind the unit test that read the developer's real `~/.claude-src/config.ts`
and passed on it: the file set no `HOME` of its own, so once its first `afterEach` ran,
`os.homedir()` answered from the machine.

## Fix Applied

In `src/cli/lib/__tests__/helpers/isolated-home.ts`, which the thirteen fixtures share:

- Both helpers now set `AGENTS_INC_SKIP_NEW_VERSION_CHECK` for the life of the isolated home and
  restore whatever they found. `isolated-home.test.ts` asserts it through
  `Config.scopedEnvVarTrue("SKIP_NEW_VERSION_CHECK")` rather than by spelling the variable, so a
  misspelled key or an unaccepted value reddens.
- The JSDoc now names the real mechanism and its two gaps — `vi.restoreAllMocks()`, and constants
  frozen at import.

Not fixed, and reported instead: `CACHE_DIR` and `GLOBAL_INSTALL_ROOT`. Both are product code this
lane did not own.

## Proposed Standard

Two, and the first is the generalisable one.

> **A path derived from `os.homedir()` at module load is not isolable by any test mechanism.**
> Neither `process.env.HOME` nor a `vi.spyOn(os, "homedir")` can reach a value a module captured
> when it was imported, and under `runCliCommand` the import happens inside the first test that runs
> a command. Resolve such paths at CALL time. `src/cli/lib/config-gate/index.ts` and
> `installation/is-home-directory.ts` already carry on-site comments saying exactly this about
> `GLOBAL_INSTALL_ROOT`; what is missing is the rule, and the grep that finds the next one:
>
> ```
> grep -rnP '^export const [A-Z_]+ = .*os\.homedir\(\)' src/cli
> ```
>
> This belongs in `CLAUDE.md` -> Test Data, beside the existing `createTempDir()` /
> `cleanupTempDir()` line, because it is a constraint on PRODUCT code that only test isolation ever
> notices.

> **An isolated HOME must also close every door a spawned or third-party process writes through.**
> `standards/e2e/README.md` already requires a spec spawning a third-party binary to pin where THAT
> binary keeps its state; the unit-test side of the same rule is missing, and the offender there is
> not a binary the spec spawns but one oclif spawns on its behalf, detached, from an `init` hook.
> `standards/e2e/test-data.md` -> _An in-process command spec owns its `HOME`_ is where it goes.
