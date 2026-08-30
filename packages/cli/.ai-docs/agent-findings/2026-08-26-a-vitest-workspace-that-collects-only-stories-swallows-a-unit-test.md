---
type: standard-gap
severity: medium
affected_files:
  - packages/ui/vitest.config.ts
  - packages/ui/package.json
  - packages/ui/src/lib/syntax-theme.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-08-26
reporting_agent: cli-tester
category: testing
domain: infra
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The mechanism landed the same day this was filed. packages/ui now runs a `unit` project built
  from @workspace/vitest-config/node beside the Storybook one, and `vitest run` reports 12 files
  and 82 tests where it reported 11 and 63. What is still open is the PROPOSED STANDARD — the
  rule in packages/cli/CLAUDE.md still scopes the diagnosis to `e2e/helpers/`, and nothing yet
  says that a new test file's first run must show its own name rather than a count.
---

## What Was Wrong

`packages/ui` declares `"test": "vitest run"`, and its `vitest.config.ts` declares exactly one
project: the Storybook browser project, whose test list the addon derives from
`stories: ["../src/**/*.stories.tsx"]` in `.storybook/main.ts`. There is no project with an
`include` that matches a `.test.ts` file.

So a unit test written anywhere under `packages/ui/src/` is **never collected**, and the workspace
still exits 0. Measured, on a file that was sitting on disk at the time:

```
$ cd packages/ui && npx vitest run
 Test Files  11 passed (11)
      Tests  63 passed (63)
```

Eleven files, sixty-three tests — every one of them a story. `src/lib/syntax-theme.test.ts`, which
holds 19 assertions and was present for that run, appears nowhere in the output and changes nothing
about the exit code.

**This is the same class `packages/cli/CLAUDE.md` already names, one workspace over.** Under "Test
Assertions" it rules that `src/cli/lib/__tests__/helpers/` is the only home for a tested helper,
"never inline and untested", and gives the reason as a measurement: "no vitest project collects
`*.test.ts` under `e2e/helpers/` — the projects in `vitest.config.ts` include only `src/**` and
`scripts/**` … so a helper test written there never runs while looking like coverage." The
diagnosis is exact and it generalises; what it does not do is leave the `packages/cli` tree. A
reader applying that rule has no reason to suspect a _second_ workspace of the same thing, and
`packages/ui` is the one that is.

**Two things that normally catch a stopped test cannot see this one.** `tsc --noEmit` and
`eslint .` both read the file — the test that proved this reported through both — so the file is
demonstrably not orphaned, not ignored and not misnamed. It is simply not in any runner's include.
And `bun run deps:check` reads `packages/ui/package.json`'s `//no-shared-vitest-config` key and
classifies the workspace as `opted-out`, printing the recorded reason as evidence the divergence is
deliberate. It is deliberate, and the recorded reason is correct as far as it goes — the suite is a
real browser and the shared node config's three settings are the opposite of what it needs. What
neither the key nor the gate records is the consequence: opting out of the shared config also opted
out of ever collecting a pure-logic test, and the note reads as covering only the first.

**Census, and it comes back clean at one.** Every other workspace running Vitest collects
`src/**/*.test.ts`: `apps/editor`, `apps/server` and `packages/matrix` all build from
`@workspace/vitest-config/node`, whose `include` is exactly that glob, and `packages/cli` declares
its own projects over `src/**` and `scripts/**`. `packages/ui` is the only workspace in the
repository where a `.test.ts` under `src/` is invisible.

```
for f in apps/*/vitest.config.ts packages/*/vitest.config.ts; do
  echo "$f"; grep -nE 'include|nodeConfig|storybook' "$f"
done
```

## Fix Applied

**Filed by the tester, applied by the developer the same day** — the two halves are recorded
separately on purpose. The tester wrote none of it: `packages/ui/vitest.config.ts` and
`packages/ui/package.json` are outside the owning lane's files (editor-v6 Phase B, lane 2, whose
exclusive files are `packages/ui/src/lib/syntax-theme.ts` and `apps/www/astro.config.ts`), and
another workflow was editing `packages/ui/src/styles/globals.css` concurrently, so the change was
named rather than made. The developer on the same lane then made it, both files being claimed by no
lane at all.

What landed, in one file plus one manifest key:

- add a second project to `packages/ui/vitest.config.ts` built from
  `@workspace/vitest-config/node`, beside the Storybook one — the shared config's
  `include: ["src/**/*.test.ts"]`, `environment: "node"` and `globals: false` are all already right
  for this;
- declare `@workspace/vitest-config` as a devDependency of `packages/ui`;
- amend the `//no-shared-vitest-config` note so it says what is now true — the browser project
  stands alone for the stated reasons, and the node project extends the shared config like every
  other workspace. `check-shared-vitest-config.ts` reads that key, so leaving it saying the
  workspace imports nothing from the shared package while it now does is a second, quieter
  divergence. Note the check SHORT-CIRCUITS on the key: a workspace that records an opt-out is never
  asked about its import or its dependency, so `bun run deps:check` cannot see either half and the
  note is the only record that they exist.

Measured after, and this is the assertion the finding asks for — the run names the file rather than
counting: `cd packages/ui && npx vitest run` reports `12 passed (12) / 82 passed (82)`, and
`npx vitest run --project unit --reporter=verbose` names
`src/lib/syntax-theme.test.ts` on all nineteen lines.

## Proposed Standard

The narrow half, and the one with a mechanism behind it: **the rule in
`packages/cli/CLAUDE.md` should say that a test file is only coverage if a runner collects it, and
should not be scoped to `e2e/helpers/`.** The existing sentence is correct and its evidence is a
measurement of one config; the property it measures is a property of every config in the
repository. Suggested placement is the same "Test Assertions" bullet, generalised — the `e2e/helpers/`
case stays as the worked example, because it is the one with a live trap behind it.

The verification half, which is cheaper than a checker and is what would actually have caught this:
**a new test file's first run must show its own name in the runner's output, not merely a non-zero
exit code.** A run that collects a file and a run that ignores it both print `Tests N passed`; only
`--reporter=verbose`, or reading the file list, tells the two apart. This is the same shape as the
pre-commit note in `packages/cli/CLAUDE.md` about the dist-staleness guard — "a run that aborts on
the guard collects ZERO tests, and a zero-test run reads as a pass if only the exit code is
checked" — arriving from the other direction: there, the collected count was zero and looked like a
pass; here, the collected count is sixty-three and looks like a pass. Both are the same missing
question, which is _which_ tests ran.

A checker is possible and is **not** proposed. `check-shared-vitest-config.ts` already walks every
workspace's config and could be extended to ask whether any project's `include` matches a
`.test.ts` under `src/`, but it would have to resolve a Storybook addon's derived test list to
avoid reporting `packages/ui` forever, and that is a lot of machinery for a class whose census is
one. Reported as a sample of one workspace, censused across all eleven; the census command is
above.
