---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/config-gate/__tests__/mutate-global.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-16
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  The comment now states what is true — the spy pins the `os.homedir()` call directly, and
  `vi.stubEnv("HOME", ...)` reaches it too under node, because node's `os.homedir()` reads `$HOME`
  on POSIX. Corrected since: bun fixes the value at startup and ignores later mutation, so under
  the other runtime this suite runs on, the spy is the only thing that works. The spy itself was
  left alone; it was never the defect.
---

## What Was Wrong

`src/cli/lib/config-gate/__tests__/mutate-global.test.ts` justified its `vi.spyOn(os, "homedir")`
with a claim about Node:

> `mutateGlobal` resolves the global config through `os.homedir()`, which ignores
> `process.env.HOME` — the spy is the only isolation that works here.

`os.homedir()` does not ignore `process.env.HOME`. Node's POSIX implementation returns `$HOME`
when it is defined and falls back to the effective UID only when it is not. Verified directly:

```
$ node -e "process.env.HOME='/tmp/fake-home-test'; console.log(require('os').homedir())"
/tmp/fake-home-test
```

The repository already depends on that being true elsewhere: every in-process command spec isolates
the developer's own `~/.claude` with `vi.stubEnv("HOME", <temp dir>)` or `setupIsolatedHome`, and
that only works because `os.homedir()` reads `$HOME`.

**Under node. Not under bun** — measured after this finding was written, and the correction matters
because this package runs its tests under both runtimes:

```
$ node -e 'process.env.HOME="/tmp/probe"; console.log(require("os").homedir())'
/tmp/probe
$ bun  -e 'process.env.HOME="/tmp/probe"; console.log(require("os").homedir())'
/home/<user>
```

So the comment this finding corrected was not simply false; it was true of one of the two runtimes
the suite runs under, and the correction below is true of the other. A path reaching `os.homedir()`
needs the spy AND the env var, which is what `isolated-home.ts` says in its own JSDoc.

The cost is not the spy — the spy is a perfectly good isolation and the test is correct. The cost
is that the comment reads as a researched constraint, so the next spec needing home isolation
takes it as settled that `stubEnv` cannot work and reaches for a spy it may not need, or spends
the investigation again. A false comment in a test is load-bearing in exactly the way a true one
is: it is the reason nobody re-derives it.

## Fix Applied

The comment now says what is actually true and why the spy is still the right choice here:

```ts
// `mutateGlobal` resolves the global config through `os.homedir()`, so the temp home has
// to be what that call returns. The spy says so directly; `vi.stubEnv("HOME", ...)` would
// reach it too, since `os.homedir()` reads `$HOME` on POSIX.
```

No test behaviour changed. Found while implementing CLI-470 legs 2–3, whose row carried "the false
`os.homedir()` comment fix" as a rider.

## Proposed Standard

Into `.ai-docs/standards/clean-code-standards.md`, in the comments section:

> **A comment that states a fact about a runtime, a library or a platform is an assertion, and it
> is checkable.** Before writing "X ignores Y", "X is the only way", or "X does not work here",
> run the one-liner that shows it. A comment of that shape is the reason the next reader does not
> re-derive it, so a wrong one costs more than no comment at all — and unlike wrong code, nothing
> in the toolchain can fail on it.

There is no enforcement to propose. `reportUnusedDisableDirectives` catches a suppression whose
rule stopped firing; nothing catches a justification whose premise was never true. The one
mitigation available is cheap and worth naming in the rule: when a claim about the environment is
load-bearing enough to write down, the assertion that depends on it usually belongs in the test as
well, where it fails when the claim stops holding.
