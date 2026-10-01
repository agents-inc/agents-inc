---
type: standard-gap
severity: medium
affected_files:
  - scripts/check-spawn-doors.ts
  - src/cli/lib/__tests__/e2e-runner-environment.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-09-25
reporting_agent: cli-tester
category: testing
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`scripts/check-spawn-doors.ts` finds a site that starts the built binary by what the spawn call
is handed: an array element that IS the identifier `BIN_RUN`, or whose literal pieces spell a path
ending in `bin/run.js`. An element that is any OTHER identifier fails both tests, whatever that
identifier holds. `isTheBinary` never follows a local to its initializer, although the same file's
`envSourcesOf` already follows locals for the environment question.

So a door written as

```ts
const BUILT_BINARY = path.join(CLI_ROOT, "bin", "run.js");
await execa(process.execPath, [BUILT_BINARY, ...args], { env: { ... } });
```

is no door at all to the scan. Both gates that read the scan pass over it. `check()` never judges
whether it carries `NO_BACKGROUND_VERSION_CHECK`. And `e2e-runner-environment.test.ts`'s membership
test ("answers for every file that starts the binary") stays green with the door missing from its
roster, so nothing asks it to clear `VITEST` or to pin `CLAUDE_CONFIG_DIR` and `CODEX_HOME`.

Measured on 2026-09-25 against the scan alone, on a fixture package holding one file, the door
above. Asked with `check({ packageRoot })` from `bun -e`, the package THREW
`... names no site that starts the binary`. The same file with the constant renamed `BIN_RUN`
answered `[{"file":"e2e/door.ts","spawnedBy":"execa","outcome":"guarded"}]`.

The scan's own docblock names this failure as the one it must not have: "a hit can be argued
with, a silence cannot even be seen". It closed the hole for an inline path, and the hole is open
for a renamed constant.

## Fix Applied

None.

## Proposed Standard

`isTheBinary` should follow an identifier to its initializer with `initializerOf`, the same hop
`envSourcesOf` makes, and judge the pieces of what it finds. The regression case belongs in
`scripts/check-spawn-doors.test.ts`: a fixture door naming the binary through a differently named
constant must be REPORTED. It must not pass as absent.
