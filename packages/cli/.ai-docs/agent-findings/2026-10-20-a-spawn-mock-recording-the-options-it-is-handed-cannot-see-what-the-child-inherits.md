---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/lib/__tests__/e2e-runner-environment.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: >-
  The spec now records the environment the child would receive and its clearing check is a
  behaviour test. The Proposed Standard is not written into CLAUDE.md, and `clearances()` in
  `scripts/check-spawn-doors.ts` has no reader left outside its own spec, which is the scripts
  lane's to judge.
---

## What Was Wrong

`e2e-runner-environment.test.ts` mocks `execa` and `@lydell/node-pty` to record each binary start
the E2E runners make. The `execa` mock recorded `options.env`, the object the runner hands over.
execa 9.6.1 does not hand the child that object: `getEnv` in `lib/arguments/options.js` spreads
`process.env` under it when `extendEnv` is on (the default), and Node's spawn drops `undefined`
entries. So a variable the developer's shell exports and the runner forgets to clear never appears
in the recorded object, though the child receives it.

The test could not observe the property it was guarding: that no runner passes a developer's
`CC_MARKETPLACE`, `GIGET_AUTH` or `XDG_CACHE_HOME` through. So it judged the runners from their
syntax instead. "$spawns clears every one of them" read each runner's spawn call through
`clearances()` in `scripts/check-spawn-doors.ts` and checked that every variable is set to
`undefined` in the env literal. That is a pin on how a runner clears. A runner that passed
`extendEnv: false` with an allow-list would fail it while handing the child exactly the same
environment.

Census of spawner mocks in the package, by
`grep -rln 'vi.mock("execa"\|vi.mock("@lydell/node-pty"\|vi.mock("node:child_process"\|vi.mock("child_process"' src e2e scripts --include='*.ts' --include='*.tsx'`:
five files. Four are `src/cli/lib/hosts/` specs mocking `child_process.spawn`. There the recorded
`env` is the child's, because `utils/exec.ts` passes `{ ...process.env, ...options?.env }` itself.
The E2E runner spec was the only one recording an object a library then merges.

## Fix Applied

The `execa` mock now records what execa would hand the child: `{ ...process.env, ...env }` unless
`extendEnv` is `false`, with `undefined` entries dropped. The PTY mock already records the child's
environment, because `terminal-session.ts` strips `undefined` before spawning. The syntax check
became "$spawns hands the child none of the variables the product reads". It stubs each rostered
variable in this process with `vi.stubEnv`, opens the runner with only `HOME`, and asserts that none
reaches the recorded environment.

To check the rewrite, a throwaway copy added a variable no runner clears to the roster. All three
runners went red, each naming that variable and no other, and the copy was deleted. The roster
census that `clearances()` cannot replace (which variables the product reads, and which files
start the binary) moved to `e2e-runner-rosters-match-the-tree.test.ts`.

## Proposed Standard

`packages/cli/CLAUDE.md` › "Test Assertions": a mock of a library that merges what it is handed
(`execa`'s `env` over `process.env`, a client merging defaults) records the merged result, the value
the far side receives. Recording the options object makes inheritance invisible, and the property
then gets checked from syntax. Checked against CLAUDE.md: nothing conflicts. It is the boundary
case of "assert the resulting state" applied to a spawned process.
