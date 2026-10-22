---
type: standard-gap
severity: low
affected_files:
  - packages/cli/src/cli/lib/installation/install-layout.ts
  - packages/cli/src/cli/lib/__tests__/helpers/cli-runner.ts
  - packages/cli/src/cli/lib/__tests__/commands/remedies-name-the-installation-beside-another.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/remedies-name-an-installation-a-bare-command-would-miss.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/list-shows-the-installation.test.ts
standards_docs:
  - packages/cli/.ai-docs/standards/e2e-testing-bible.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: missing-rule
status: open
---

## What Was Wrong

`--provider` is committed for the run in module state: `providerChosenForThisRun` in
`install-layout.ts`, set by `chooseProviderForThisRun`. `runCliCommand` runs
`run(args, { root: CLI_ROOT })`, and the package's oclif config loads commands from
`./dist/commands`. So a spec that passes `--provider` through `runCliCommand` sets the variable in
`dist/`'s copy of the module, and every later `runCliCommand` spec in the same worker inherits it.
`forgetTheProviderChosenForThisRun`, imported from source, resets a different module instance and
does nothing for those specs.

It showed up in `remedies-name-the-installation-beside-another.test.ts`: a spec that named
`--provider codex` made a later bare run print the Codex remedy. That file now runs the spec that
names a provider last, with a docblock saying why. That is order-dependence, and nothing enforces
it.

Census of `runCliCommand` spec files that pass `"--provider"`:
`grep -rln "runCliCommand" src --include='*.test.ts' --include='*.test.tsx' | xargs grep -ln '"--provider"'`
returned four files:

- `remedies-name-the-installation-beside-another.test.ts`: order-dependent, as above.
- `init-from-says-what-it-did.test.ts`: its one `--provider` run is refused before
  `chooseProviderForThisRun` (`init.tsx`), so nothing is committed.
- `list-shows-the-installation.test.ts` and
  `remedies-name-an-installation-a-bare-command-would-miss.test.ts`: every `--provider` run goes
  through the source-imported command with `captureOutput`, so the source reset in `afterEach`
  applies.

## Fix Applied

None beyond the ordering and the docblock in the first file, and the source-imported commands in
the new remedies file.

## Proposed Standard

A rule in `e2e-testing-bible.md` (or wherever command-spec conventions land): a spec that names
`--provider` runs the command imported from source with `captureOutput` and resets in `afterEach`,
never through `runCliCommand`. The alternative is a reset that reaches `dist/`, for example
`runCliCommand` importing `dist/`'s `install-layout.js` and calling its reset in `finally`. Either
way the beside-another file can then drop its ordering.
