---
scope: reference
area: testing
keywords:
  [
    e2e,
    harness,
    PTY,
    node-pty,
    xterm-headless,
    tree-kill,
    stripVTControlCharacters,
    stripAnsi,
    fake-timers,
    delay,
    waitForText,
    polling,
    permission-checker,
    checkPermissions,
    createPermissionsFile,
    createE2ESource,
    createTestSource,
    disableConsoleIntercept,
    CLI_ROOT,
    MONOREPO_ROOT,
    ASCII_LOGO,
    validateBuildStep,
    zero-state,
  ]
related:
  - reference/testing/e2e-infrastructure.md
  - reference/testing/infrastructure.md
  - reference/monorepo-layout.md
  - reference/commands/index.md
last_validated: 2026-08-04
---

# E2E Harness — Settled Decisions and CLI Behaviour

> **Provenance.** This file absorbs what survived `e2e/FINDINGS.md`, which is retired. FINDINGS held
> three kinds of entry: conventions (which had already moved into `standards/e2e/` and
> [`e2e-infrastructure.md`](./e2e-infrastructure.md)), a progress narrative (dropped), and the two
> kinds kept here — **CLI behaviour a test has to satisfy** and **tooling alternatives that were
> evaluated and rejected**. The second kind is the reason this doc exists: an alternative nobody
> wrote down is an alternative the next agent re-proposes.

> **Scope.** This doc holds _why the harness is shaped the way it is_ and _what the CLI does that a
> test must work around_. It owns **no** API surface: page-object methods, constants, matchers,
> fixtures and timeouts are all [`e2e-infrastructure.md`](./e2e-infrastructure.md)'s, and the
> prescriptive rules are `standards/e2e/`'s. Nothing here restates either.

## 1. CLI behaviour a test has to satisfy

### 1.1 The post-install permission notice has no exit of its own

`checkPermissions(projectRoot)` in `src/cli/lib/permission-checker.tsx` **returns a React element or
`null`** — it renders nothing itself. The element it returns is a static `<Box>` of `<Text>`: no
`useInput`, no `useApp().exit()`. Nothing in it can ever resolve `waitUntilExit()`.

`Init.run` is the only production caller, and it branches:

```ts
if (interactive) {
  const { waitUntilExit } = render(permissionWarning);
  await waitUntilExit(); // waits for a person
} else {
  const { unmount } = render(permissionWarning);
  unmount(); // one frame, then let go
}
```

Two consequences that look unrelated and share one cause:

- **An interactive E2E that runs `init` to completion hangs** unless the project already grants
  permissions. `checkPermissions` returns `null` when a `permissions` block is found in
  `.claude/settings.json` or `.claude/settings.local.json` (local wins), so the fix is to write that
  file **before** launching. `createPermissionsFile(dir)` does exactly this — see
  [`e2e-infrastructure.md`](./e2e-infrastructure.md), which owns its merge semantics.
- **`init --from` must not await it**, because it has to complete over a pipe and in CI. That is what
  `Selection.interactive: false` buys; see [`features/seed-contract.md`](../features/seed-contract.md).

A hang here presents as a full-timeout flake, not as an assertion failure — the same misleading
shape as the terminal-geometry gate.

### 1.2 Ink repaints in place, so pre-wizard log lines are not a reliable anchor

A command logs status lines before it mounts the wizard. Once Ink paints a frame that fits the
viewport, each repaint overwrites the previous one and nothing enters scrollback, so those earlier
lines may or may not still be matchable depending on how fast the poll ran.

**Anchor on wizard-rendered text, never on pre-wizard log output.** The buffer mechanics — what
`getOutput()` / `getScreen()` actually read, and why `getScreen()` is not viewport-only despite its
name — belong to [`e2e-infrastructure.md`](./e2e-infrastructure.md) and `standards/e2e/anti-patterns.md`
§ "Never assert that text is ABSENT from a screen the session once legitimately drew". This entry
only records that the pre-wizard window is the reason the rule bites earlier than expected.

### 1.3 The ASCII logo contains no letters

`ASCII_LOGO` in `src/cli/consts.ts` draws its letterforms out of Unicode box-drawing characters.
`toContain("AGENTS")` cannot match it. Anchor on adjacent real text (`"Marketplace:"`) instead.

### 1.4 A source's `config/stacks.ts` REPLACES the built-in stacks — it does not merge

`resolveOfferedStacks` in `src/cli/lib/loading/source-loader.ts` returns the source's own stacks
when it ships any; when it ships none, the built-in catalogue stands in **only for the default
public marketplace**, and any other source offers `[]`.

Either/or, decided by whether the source shipped any. This is what lets `createE2ESource()` control
the stack step completely: it writes one stack (`E2E_STACK_NAME`, `E2E_STACK_ID`), so the wizard
offers one instead of the real catalogue's dozen — faster and deterministic. Its
`withoutStacks: true` option writes no stacks file at all, and a `--marketplace` fixture built that way
gets no stack step: the wizard opens on DOMAINS, which is why `InitWizard.launchOnDomainsInProject`
exists. The precedence table for every other kind of source override is
[`features/built-in-catalogue.md`](../features/built-in-catalogue.md)'s.

**The corollary is a fixture constraint:** a source's stack may only name skills that exist in that
source. A stack referencing an absent skill fails the copy during install, and the failure surfaces
as a non-zero exit from the whole run rather than as anything that names the stack.

### 1.5 Zero-state is a clean exit, not an error, for the directory-scanning commands

`build plugins`, `build marketplace` and `update` all operate on whatever is present and report
nothing found rather than failing. `build` reports `0`; `update` warns `No installation found` and
returns. Both are worth a spec of their own, and neither needs setup.

### 1.6 `search` is a zero-flag command

`static flags = {}`, and there is no inherited flag left to drop: `--marketplace` is `init`'s alone.
A test cannot select a source for `search` with a flag OR with `CC_MARKETPLACE` (`SOURCE_ENV_VAR` in
`lib/configuration/config.ts`, read for `init` only) — it records the source in the install's
config, which is what `recordInstallSource()` in `e2e/helpers/test-utils.ts` is for. The flag inventory is
[`commands/index.md`](../commands/index.md)'s and the resolution order is
[`features/configuration.md`](../features/configuration.md)'s.

### 1.7 Ctrl+C through the PTY is reliable

`TerminalSession.ctrlC()` writes `\x03`; the PTY delivers SIGINT to the process group and the
process dies with a non-zero code. Nothing special is needed. Because `init` and `edit` write
files only after the wizard completes, a cancelled run leaves the filesystem untouched — which makes
"abort, then assert nothing changed" a sound pair rather than a race.

### 1.8 The harness passes `CI` and `GITHUB_ACTIONS` through, on purpose

`terminal-session.ts` builds the child's environment as `{ ...process.env, ...options.env, … }` and
does **not** strip either variable. That is the reverse of what it used to do, and reversing it back
would look like a cleanup.

Ink decides whether it is interactive by consulting those variables (through `is-in-ci`) **before**
it looks at the stream it was handed, and under CI it buffers every frame and writes only at exit. A
screen awaiting input is then never painted. That is what ran one CI suite for **49 minutes** — the
harness hands the child a genuine pseudo-terminal while the runner's environment says `CI`.

The fix lives in the CLI, not in the harness: `src/cli/components/render.ts` passes
`interactive: true` whenever the destination stream is a TTY, so a real terminal beats the guess. The
harness therefore keeps the variables **so that every CI run exercises that wrapper**. Strip them and
the suite stops testing the one condition the bug needs.

The unit side is the deliberate opposite — `vitest.setup.ts` deletes both at module scope, because a
component test rendering against fake streams must not have "in CI" as a concept at all. Two
environments, two opposite policies, one reason. See
[`infrastructure.md`](./infrastructure.md) and [`commands/index.md`](../commands/index.md).

Downstream: `e2e/vitest.config.ts`'s `retry` came down from `2` to `1` after this landed, measured
green at `0`. [`e2e-infrastructure.md`](./e2e-infrastructure.md) owns that value.

## 2. Corrections — three FINDINGS claims that are now false

Recorded rather than dropped, because each was believed for long enough to be designed around, and
two of them describe a gate an agent would otherwise write tests to satisfy.

| Retired claim                                                                         | Current source                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Required categories block wizard advancement; select a Framework skill before Enter" | **False.** `StepBuild`'s `useInput` calls `onContinue()` unconditionally, and `useBuildStepProps`'s `onContinue` is `if (!store.nextDomain()) store.setStep("sources")`. There is no validation on the path                                                                                                                                                                                                                        |
| "A styling skill must be pre-selected or the edit wizard cannot advance past build"   | **False**, same mechanism                                                                                                                                                                                                                                                                                                                                                                                                          |
| "The `search` interactive path ignores `--source`, so use `CC_SOURCE`"                | **False three times over.** `search` is no longer interactive and has `static flags = {}`, so any flag is rejected rather than ignored; `--source` / `CC_SOURCE` are withdrawn spellings that nothing reads under any command; and the surviving `CC_MARKETPLACE` is read for `init` alone, so it steers nothing here either. A spec records the source in the install's config — `e2e/interactive/search-static.e2e.test.ts` does |

`validateBuildStep` (`lib/wizard/build-step-logic.ts`) does compute the required-category message,
and its behaviour is tested — but **it has no production caller**, so nothing renders or enforces it.
[`leaf-exports.md`](../leaf-exports.md) owns that entry; do not read the function's existence as
evidence of a gate.

## 3. Tooling alternatives already evaluated — do not re-litigate

Each row was investigated once, with the alternatives named. None of them is an open question.

| Choice                                                         | Alternatives rejected, and why                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@lydell/node-pty` + `@xterm/headless`** (`TerminalSession`) | `node-pty` alone leaves ANSI in the output and every assertion brittle — the xterm layer is what makes a clean screen readable. `ink-testing-library` cannot spawn the real binary. `expect`/`pexpect` are other languages. `nixt` is abandoned and does not handle full-screen Ink. `cli-testing-library` is concept-stage. There is no Node alternative for this specific job |
| **`tree-kill`** for teardown                                   | `process.kill(-pid)` only handles process groups and misses spawned children; `fkill` is heavier than the need; execa's `kill()` does not apply to PTY-spawned processes; manual PID walking is fragile and platform-dependent. `tree-kill` has zero dependencies and a complete API                                                                                            |
| **`stripVTControlCharacters` from `node:util`**                | The `strip-ansi` package is **not** a dependency and is not needed. `stripAnsi()` in `e2e/helpers/test-utils.ts` is a one-line wrapper kept purely for a readable call site; `terminal-session.ts` calls the built-in directly                                                                                                                                                  |
| **Real `setTimeout` in `delay()`** — never fake timers         | E2E tests drive real subprocesses. `vi.useFakeTimers()` advances only the test process's event loop, never the CLI's rendering timers, so it cannot synchronise anything the harness waits on                                                                                                                                                                                   |
| **Polling in `waitForText()`**                                 | An EventEmitter form (check pending predicates on each xterm `onData` chunk) and a dirty-flag form were both designed and neither was needed — tests settle in ~1s each. Revisit only if the interactive suite grows enough for polling to show up as a bottleneck                                                                                                              |
| **`createE2ESource` and `createTestSource` stay separate**     | They are not duplicates. `createE2ESource` builds a genuine on-disk source a spawned CLI consumes; `createTestSource` builds lightweight structures for in-process tests. Only the low-level filesystem utilities are shared, and the existing cross-import of a mock factory is fine                                                                                           |
| **No `disableConsoleIntercept` in the E2E Vitest config**      | It is set in the unit config (`vitest.config.ts`) and is a unit-test concern: E2E captures output from a **subprocess**, never from the test process, so the option has nothing to act on                                                                                                                                                                                       |

## 4. The monorepo consequence a test author meets first

`e2e/helpers/test-utils.ts` exports `CLI_ROOT` (`packages/cli`) and `MONOREPO_ROOT` (the repository
root). **Anything resolved against a sibling checkout must use `MONOREPO_ROOT`.** They were the same
path until the CLI moved one directory down; since then a sibling resolved off `CLI_ROOT` lands
inside `packages/`, the specs that read it decide the directory is missing, and they skip
themselves — a green run that silently lost ten tests. See
[`monorepo-layout.md`](../monorepo-layout.md).

## Related Documentation

- [`e2e-infrastructure.md`](./e2e-infrastructure.md) — the harness API: page objects, constants,
  matchers, fixtures, timeouts, buffer semantics
- [`infrastructure.md`](./infrastructure.md) — Vitest projects and the unit-side configuration
- [`monorepo-layout.md`](../monorepo-layout.md) — the repository around `packages/cli`
- `standards/e2e/*` — the prescriptive rules. `standards/e2e-testing-bible.md` is now a pointer into that directory
