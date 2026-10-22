---
type: anti-pattern
severity: medium
affected_files:
  - scripts/generate-compile-package.test.ts
  - scripts/run-generate-compile-package.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  The writer has a behaviour spec (`bun run generate:compile --compile-root <dir>` writes the
  committed bytes there), and the chain spec matches the whole command rather than a substring.
---

## What Was Wrong

A test pinned both `generate:compile` and `generate:compile:check` to their exact commands. A
prune pass rewrote it as a spawn of `generate:compile:check` plus a check that the key
`generate:compile` exists. Nothing held what the writer runs any more. Wiring `generate:compile` to
`run-generate-compile-package.ts --check` left every spec green, while `bun run generate` and the
release regeneration would have stopped writing `packages/compile`.

The spec beside it had the same gap: `expect(scripts.generate).toContain("generate:compile")` is
satisfied by `bun run generate:compile:check`, because the writer's name is a prefix of the
check's. Reproduce in a scratch copy of `packages/cli` by changing the chain's last step to
`generate:compile:check`: the old spec passed.

## Fix Applied

`run-generate-compile-package.ts` takes `--compile-root <dir>` on both branches. The suite spawns
`bun run generate:compile --compile-root <tmp>` and asserts the files there equal the committed
ones, then does the same for the check against an empty directory and for the flag with no value.
Wiring the writer to the check or to the matrix generator now fails the writer spec. The chain spec
splits on `&&` and expects the element `bun run generate:compile`.

Census of script-name substring assertions:

```
grep -rnE 'toContain\("(bun run |npm run |pnpm )?[a-z]+:[a-z:-]+"\)' --include='*.test.ts' --include='*.test.tsx' packages apps
```

Only this file. The remaining hit is the CI spec's `bun run generate:compile:check`, which no
shorter script name can satisfy.

## Proposed Standard

When a pin is rewritten into a behaviour spec, every value the pin held needs its own behaviour
form, or that value stays pinned. Check this by mutating each value and confirming the new spec
fails. An assertion on a script name matches the whole command, because `x` is a prefix of
`x:check`. The home is `clean-code-standards.md`, beside the rule against weakening an assertion.
