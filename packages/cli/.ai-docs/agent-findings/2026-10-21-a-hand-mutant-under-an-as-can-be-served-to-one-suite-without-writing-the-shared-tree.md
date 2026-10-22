---
type: missing-standard
severity: low
affected_files:
  - docs/architecture.md
  - packages/compile/src/seed-to-config.ts
standards_docs:
  - docs/architecture.md
date: 2026-10-21
reporting_agent: cli-tester
category: testing
domain: infra
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`docs/architecture.md` › "Mutation testing" says code under a TypeScript `as` gets no Stryker mutant,
"so break such code by hand", and says no more. The obvious way, editing the source file, serves
the mutant to every suite and typecheck running in the tree at the same time. Here many agents run
at once, so that is not safe. The same section's "one run at a time" also cannot hold across
parallel lanes, because every root config writes to the same `reports/mutation/mutation.json` and
`.stryker-tmp`.

Measured on REPO-44 step 8 (compile's changed lines): the first pass and the static pass gave 6
Survived mutants in `seed-to-config.ts`, none of them under an `as`. 19 hand mutants on
`as`-shielded changed lines there were each served through the config below, and the source file
was never written. 17 were killed. 2 survived, both on `resolveActiveAgentConfigs`' `providedConfigs ===
undefined` branch: changing its `scope: "project" as const` to `"global"`, or its whole mapping to
`[]`. That branch only ever maps an empty list, because `assertScopeConfigsGiven` throws first
whenever `selectedAgents` is non-empty.

## Fix Applied

None in the tree. The method, as used:

- A vitest config outside the tree spreads the workspace's `vitest.mutation.config.ts` (whose `root`
  is the workspace) and adds one Vite plugin with `enforce: "pre"`. Its `transform(code, id)`
  replaces an exact snippet in the one file named by `MUTANT_FILE`, and throws unless the snippet
  occurs exactly once, so a stale snippet fails loudly rather than reading as Survived. Run it with
  `node_modules/.bin/vitest run --config <that file>`, once per mutant.
- Stryker runs from parallel lanes each use a config outside the tree that spreads the root config
  and sets its own `tempDirName`, `jsonReporter.fileName` and `incrementalFile`.

## Proposed Standard

`docs/architecture.md` › "Mutation testing": break code under an `as` with a Vite `transform` plugin
in a vitest config outside the tree, never by editing the file, and give a run that may overlap
another its own `tempDirName`, `jsonReporter.fileName` and `incrementalFile`. Nothing checks
either rule. Not in conflict with `CLAUDE.md`. This is the hand-break method that
`2026-10-20-stryker-never-mutates-code-under-a-typescript-as-and-the-report-does-not-say-so`
leaves open.
