---
type: missing-standard
severity: medium
affected_files:
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/installation/local-installer.test.ts
  - src/cli/commands/uninstall.tsx
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
date: 2026-07-30
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: partial
partial_note: >-
  The coverage side is landed: the symlinked-ancestor round trip is pinned at unit level in
  local-installer.test.ts ("should deregister a project reached through a symlinked ancestor"), and
  it was verified to fail against the pre-fix `path.resolve` normalization. The standards side is
  NOT landed: no doc yet states that path-canonicalization behaviour is unreachable from E2E, so
  the next agent asked to "cover this end to end" can still spend the effort and ship a test that
  cannot fail.
---

## What Was Wrong

`registerProjectPath` stored `fs.realpathSync(projectDir)` in the global config's `projects[]`,
while `deregisterProjectPath` looked the entry up under `path.resolve(projectDir)`. On any layout
where an ancestor of the project is a symlink the two never matched, so `cc uninstall` silently
left the project registered forever. Both ends now share one `normalizeProjectPath` helper.

The natural instinct is to cover that end to end: build a symlinked sandbox and drive
`cc uninstall` through the symlinked path. **That test cannot fail, and it cannot fail for a
reason that has nothing to do with the fix.**

`uninstall.tsx` takes its project directory from `process.cwd()`. On POSIX, `process.cwd()` is
`getcwd(2)`, which returns the kernel's canonical path — every symlink already resolved. It does
not consult `$PWD`. Spawning a child with `cwd: <sandbox>/link/proj` therefore gives the child
`process.cwd() === <sandbox>/real/proj`, verified directly in this environment:

```
child spawned with cwd=<sandbox>/link/proj
child process.cwd() -> <sandbox>/real/proj
```

So by the time production code sees the path, the symlink is gone. `path.resolve` and
`fs.realpathSync` agree on an already-canonical absolute path, the pre-fix and post-fix code
behave identically, and an E2E spec built on the symlink passes green against the bug it claims
to pin. That is strictly worse than no test: it advertises coverage that does not exist.

The general shape: **any production input that the OS canonicalizes before the process observes
it cannot be varied from an E2E test.** `process.cwd()` is the instance that bit here; the same
holds for anything else derived from the kernel's view of the filesystem rather than from an
argument, a flag, or a config value.

## Fix Applied

Coverage was written one layer down, where the path is still an argument the test controls:
`local-installer.test.ts` -> `deregisterProjectPath` -> "should deregister a project reached
through a symlinked ancestor". It creates `<sandbox>/real/project`, symlinks
`<sandbox>/link -> <sandbox>/real`, registers through `writeScopedConfigs(..., <sandbox>/link/project, ...)`
and then deregisters through the same symlinked path, asserting `projects[]` goes
`[<sandbox>/real/project]` -> `[]`.

Falsifiability was checked by temporarily restoring the pre-fix `path.resolve(projectDir)` in
`deregisterProjectPath`: the new test failed with the entry still present, while all four
pre-existing plain-path tests in the same describe passed. The production file was restored
byte-identical (md5 verified) afterwards.

No E2E spec was added, deliberately. The existing plain-path E2E coverage
(`uninstall-manifest-removal.e2e.test.ts` -> "deregisters the project from the global config's
projects registry") remains the right level for the end-to-end contract.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md`, as a new subsection under **Harness Invariants**:

> ### Never try to vary an input the OS canonicalizes before the process sees it
>
> **What:** An E2E spec that builds a symlinked sandbox (or otherwise perturbs the path used to
> reach a directory) to exercise path-normalization behaviour in a command that derives its target
> from `process.cwd()`.
>
> **Why:** `process.cwd()` is `getcwd(2)` — the kernel returns the canonical path with every
> symlink already resolved, and it ignores `$PWD`. Spawning with `cwd: <tmp>/link/proj` gives the
> child `process.cwd() === <tmp>/real/proj`. The distinction the test is trying to create is
> erased before any production line runs, so the spec passes identically against the bug and
> against the fix. A test that cannot fail is worse than no test.
>
> **Instead:** cover it at the layer where the path is still a parameter the test supplies —
> `local-installer.test.ts` for `registerProjectPath` / `deregisterProjectPath`. Keep the E2E spec
> for the plain-path contract only. Before writing any E2E spec whose subject is "how a path is
> normalized", check whether the value reaches production through `process.cwd()`; if it does,
> the E2E layer cannot express the case.

The reference-side counterpart belongs in `.ai-docs/reference/testing/e2e-infrastructure.md` under
**Scope & HOME model**, which already documents how the harness controls `HOME` and `cwd`: one
sentence recording that `cwd` is canonicalized by the kernel, so the harness can choose WHICH
directory a command runs in but never by WHICH PATH it is reached.
