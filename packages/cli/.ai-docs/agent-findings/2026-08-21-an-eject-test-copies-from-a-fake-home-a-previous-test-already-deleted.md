---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/commands/eject.test.ts
  - src/cli/lib/__tests__/helpers/isolated-home.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-21
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`eject.test.ts` goes red under load with `Could not copy N of 238 skills`, and it reads as a
skill-copy or cache fault in the product. It is neither. **The copy is reading a marketplace cache
that belongs to an earlier test in the same file, under a fake home that `afterEach` has already
deleted.**

The evidence is inside one failing report. Every path in it carries the `cc-eject-test-` prefix,
and that prefix has exactly one producer:

```
grep -rn 'cc-eject-test-' src e2e --include='*.ts' --include='*.tsx'
```

— `eject.test.ts`'s own `setupIsolatedHome("cc-eject-test-")`, called from `beforeEach`, so every
test in the file gets a fresh one. Yet a single `Could not copy` report named **two** of them:

```
sed -n '/Could not copy/,/^}/p' <run-log> | grep -oE '/tmp/cc-eject-test-[A-Za-z0-9]+' | sort | uniq -c
    150 /tmp/cc-eject-test-D20V1J
      1 /tmp/cc-eject-test-RXdfy1
```

150 source paths under `D20V1J/fakehome/.cache/agents-inc/sources/...` — a PREVIOUS test's fake
home — and one destination under `RXdfy1/project/.claude/skills/`, the running test's. A test
cannot legitimately read from a temp directory that a sibling created and destroyed. The
accompanying `ENOTEMPTY: directory not empty, rmdir` on a cache skill directory is the other half
of the same race: cleanup deleting a tree while a copy still walks it.

**Why it reads as a product defect and is not one.** No user run rebinds `$HOME` repeatedly inside
one process, so the state that leaks here has no production analogue. And the failure is upstream of
anything a reader would suspect: `copySkillsToLocalFlattened` runs inside `executeEject`, which
completes before `ensureConfig` — so the config-loading work on that command is not on this path at
all.

**Why it only appears under load.** Whether the earlier test's tree is still readable when the later
test walks it depends on when `cleanup` actually finished, which is scheduling. Measured today:

| Scope                                          | Result                       |
| ---------------------------------------------- | ---------------------------- |
| `eject.test.ts` alone                          | 55/55 pass                   |
| the whole `commands` project (21 files)        | 451/451 pass                 |
| the full three-project run on a loaded machine | red, twice, in the same file |

**The isolation this file uses is documented as insufficient, in two places, and it carries no
compensating spy.** `isolated-home.ts`'s own docblock says `setupIsolatedHome` sets
`process.env.HOME` and does NOT reliably isolate code reaching `os.homedir()` — node re-reads
`$HOME`, bun resolves it once at startup, and this package runs its tests under both — closing with
"The two mechanisms are NOT interchangeable." `source-loader.test.ts` states the same thing at its
own fake home and pairs the env var with `vi.spyOn(os, "homedir")`. `eject.test.ts` has zero
occurrences of `homedir`.

This finding stops at attribution and does not claim to have identified WHICH module carries the
resolved path across the test boundary. Candidates were looked at and none was proved:
`askedThisRun` in `source-fetcher.ts` is keyed by `cacheDir`, so a stale entry is unused rather than
misdirected, and the matrix provider holds process-level state that this file initializes. Naming
one without the evidence would be the guess this directory exists to replace.

## Fix Applied

None — attribution only, and deliberately so. The row that met this failure was scoped to `eject`'s
exit code; the fix here belongs to the test-isolation helper and the loading layer, and weakening
the assertion to make it green would delete the only signal that a test is reading a deleted
directory.

## Proposed Standard

**A test that rebinds `$HOME` must also spy `os.homedir`, or state at its own fixture why it does not
need to.** The helper already says the two mechanisms are not interchangeable; what is missing is
anything that notices a caller taking only one of them. The rule is cheap to enforce and the census
is one command — every file calling `setupIsolatedHome` or `useFakeHome` with no `homedir` spy
beside it:

```
grep -rlP 'setupIsolatedHome\(|useFakeHome\(' src --include='*.ts' --include='*.tsx' \
  | xargs grep -Lc 'homedir'
```

A gate over that list would have to allow the files that genuinely never reach `os.homedir()`, so
the honest shape is a roster with a stated reason per exemption — the same shape
`failure-reporting-classification.test.ts` uses for warn sites, where the judgement is one only the
author can make and the gate's job is to require that it was made.

**The weaker half is worth saying separately, because it is what cost the time here.** A per-test
temp directory whose path appears in another test's failure message is a leak with a one-line
detector: assert that every path a failure report names sits under the running test's own temp
directory. Nothing in this suite does that, which is why the report was read three times as a
product fault before the prefix was counted.

Home for the rule: `.ai-docs/standards/clean-code-standards.md`, in the testing section beside the
existing fixture-isolation guidance. Cross-checked against CLAUDE.md: it conflicts with nothing
there, and it is the missing enforcement for a hazard `isolated-home.ts` already documents in prose.
