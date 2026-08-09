---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/src/cli/lib/__tests__/integration/import-skill.integration.test.ts
  - packages/cli/package.json
  - packages/cli/vitest.config.ts
  - packages/cli/vitest.global-setup.ts
  - packages/cli/src/cli/lib/__tests__/packaging.test.ts
  - packages/cli/turbo.json
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-09
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  CLI-457 landed both halves this finding offered as alternatives, because measuring the invocation
  paths showed neither closes the trap alone. `pretest: "bun run build"` in packages/cli/package.json
  mirrors pretest:e2e and covers `bun run test` / `npm test`; it fires under bun 1.2.6 (verified).
  A script hook cannot see `npx vitest run <file>`, which is how most scoped runs in this
  repository are actually made — leaf-exports.md, skill-primitives.md and seed-contract.md all
  record results obtained that way — so vitest.config.ts also gained
  `globalSetup: ["./vitest.global-setup.ts"]`, which throws before a single spec is collected when
  the newest mtime under src/ (build inputs only) is later than the newest under dist/. It refuses
  rather than rebuilding, so a direct run stays fast and deliberate. Two design points are
  load-bearing and are recorded in the file itself. It globs directories as well as files, because
  the case this exists for is a DELETED source, which leaves no file to stat — only its parent
  directory's mtime moves. And it ignores `*.test.ts(x)`, `__tests__` and `__mocks__` both as
  patterns and as bare directory names, mirroring tsup's entry negations, so editing or adding a
  spec never trips it. Turbo's cache restore was measured before relying on mtimes: a FULL TURBO
  replay into an absent dist/ stamps the restored files with the current time, so a cache hit
  cannot produce a false "stale". The rule is now clean-code-standards 6.19, naming both suites
  whose greens to distrust; reference/testing/infrastructure.md and reference/build-and-packaging.md
  §9 were corrected (the latter still said no pretest hook existed). Reproduced red-first before the
  fix and green after: with src/cli/commands/list.tsx moved out of the tree,
  `npx vitest run .../commands/list.test.ts` reported 4 passed against dist/commands/list.js; with
  the guard in place the same command exits 1 naming the staleness.
---

## What Was Wrong

`vitest run` is green against whatever `dist/` happens to hold, and nothing rebuilds `dist/`
before it. Only `test:e2e` has a `pretest:e2e` hook.

That is not a theoretical hole. Deleting `src/cli/commands/import/skill.ts` in CLI-452 left
`dist/commands/import/skill.js` behind, and `src/cli/lib/__tests__/integration/import-skill.integration.test.ts`
— which drives the command through `runCliCommand` — passed all eleven of its tests against the
orphaned bundle. The full unit suite reported **136 files passed** with the command's source
already gone from the tree. The failure only surfaced after a `rm -rf dist && bun run build`, and
then it was ten hard failures in one file.

The trap has a specific shape worth naming: it is invisible in the direction that matters. A
command test that goes green after you delete the command reads as "nothing depended on it". A
command test that goes red after you delete the command reads as "here is the spec you missed".
The stale bundle silently converts the second into the first, and the only signal is a file you
were not looking for staying quiet.

`tsc` does not cover it either — the spec compiled fine, because `runCliCommand` addresses the
command by its oclif id string (`"import:skill"`), not by importing the module.

## Fix Applied

Nothing at the time — the spec was deleted along with the command, and the discovery was recorded
here. The working practice that caught it was **rebuild before believing a command test's green**,
which is what the CLI-452 prompt instructed and what turned a false green into the real result.

CLI-457 replaced that practice with enforcement on 2026-08-09; the mechanism, the measurements it
rests on and the red-first reproduction are in `resolved_by:` above.

### CLI-458 closed the hole CLI-457 left (same day)

CLI-457's guard scanned `packages/cli/src` only, and that is not all of what tsup compiles:
`@workspace/matrix` is inlined into the bundle (`noExternal`), so matrix source is build input with
no build output of its own to go stale instead. Reproduced red before the fix — `touch`
`packages/matrix/src/read-model/domains.ts` with `dist/` untouched, then
`npx vitest run src/cli/lib/__tests__/commands/help.test.ts`: **18 passed** against a `dist/` older
than every matrix source file. The guard now scans `BUILD_INPUT_TREES` —
`packages/cli/src` and `packages/matrix/src` — refuses naming whichever moved and why matrix counts,
clears on rebuild, and stays quiet when a matrix **spec** is edited. A deleted matrix source trips
it (parent directory mtime). Cost of the second tree: 28 entries, +0.3 ms median on a ~25 ms scan.

The ticket's other half did not exist. It read turbo's `test -> build` as contributing nothing for
matrix, since matrix has no `build` script — measurement says otherwise on turbo 2.10.8: turbo puts
a `<NONEXISTENT>`-command node in the graph for a dependency that does not implement the task, hashes
its files, and feeds that hash to the dependent. One comment line appended to a matrix source file
turned `agents-inc#build` from `>>> FULL TURBO` into a re-run; the same edit in `packages/ui`, which
the CLI does not depend on, left the hash byte-identical. **No turbo change was made**, and the
measurement is recorded in `packages/cli/turbo.json` and `reference/build-and-packaging.md` so the
inference is not repeated. `packaging.test.ts`'s `skipIf(!existsSync(DIST_DIR))` retired in the same
pass: with `dist/` moved aside the run now ends in `globalSetup` on "dist/ does not exist" and never
reaches collection, so the condition could not be observed.

**The standing rule this leaves** (clean-code-standards 6.19): anything this package inlines from
another workspace joins `BUILD_INPUT_TREES` the day it is inlined. A build input the guard cannot
see is a false green it cannot stop.

## Proposed Standard

Add a `pretest` hook to `packages/cli/package.json` mirroring the existing `pretest:e2e`, so the
unit/integration suite runs against a `dist/` derived from the source under test:

```json
"pretest": "bun run build",
"test": "vitest run"
```

The cost is one tsup pass (~200ms measured this session) on a suite that already takes ~25s. If
that is judged too coarse — most of the 136 files never touch `dist/` — the narrower alternative
is a guard in the `commands` vitest project's setup that fails if `dist/` is older than the newest
file under `src/cli/commands/`.

Either way the rule belongs in `.ai-docs/standards/clean-code-standards.md` § 6 (testing) as its
own numbered item: **a spec that invokes the CLI by oclif command id is testing the build output,
not the source, and its green means nothing until the build is current.** Name the two suites that
have this property (`lib/__tests__/integration/*` via `runCliCommand`, and everything under `e2e/`)
so the next reader knows which greens to distrust.
