---
type: anti-pattern
severity: low
affected_files:
  - packages/eslint-config/base.js
  - packages/eslint-config/no-matcher-cast.js
  - apps/editor/src/features/configure/lib/compose-proposal.test.ts
  - apps/editor/src/lib/api/configs.test.ts
  - apps/server/e2e/dev.e2e.test.ts
  - apps/server/src/compose.test.ts
  - apps/server/src/index.test.ts
  - packages/api-mocks/src/entry-points.test.ts
  - packages/api-mocks/src/handlers.test.ts
  - src/cli/lib/seed/installation-payload.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-20
reporting_agent: cli-developer
category: typescript
domain: shared
root_cause: missing-rule
status: resolved
resolved_by: >-
  workspace/no-matcher-cast in packages/eslint-config, registered in baseConfig so every workspace
  lints with it, and every census site rewritten as a typed expected object.
---

## What Was Wrong

Specs cast asymmetric matchers, `expect.any(String) as string` or `as unknown`. Census, run from the
repository root:

```
git grep -nE "expect\.(any|anything|objectContaining|arrayContaining|stringContaining|stringMatching)\([^)]*\)\)? as " -- '*.ts' '*.tsx'
```

It found 14 sites in the 8 files listed above. A balanced-paren scan for multi-line casts found the
same 14. No variable holding a matcher was cast anywhere.

The casts were not there for `toStrictEqual`. In vitest 4.1.10 `toStrictEqual: <E>(expected: E)`
takes any type. Vitest declares every asymmetric matcher `=> any`, and
`@typescript-eslint/no-unsafe-assignment` reports an object-literal property that holds `any` unless
the property's contextual type is `unknown`. Stripping the casts from
`apps/server/src/index.test.ts` and linting through `--stdin` gave two `no-unsafe-assignment`
errors. The one CLI cast did nothing at all, because `packages/cli/eslint.config.js` turns the
unsafe-* rules off for specs.

Only the matcher's immediate parent counts. A matcher nested inside an object that itself fills an
`unknown` slot is reported again, so `expect.objectContaining<Record<string, unknown>>({ system: [{
text: matcher }] })` does not clear `text`.

A `no-restricted-syntax` selector in the shared config would have missed the files that needed it.
Its options do not merge across config blocks, and the last block wins. `apps/editor` and
`packages/compile` turn the rule off for specs, and `packages/cli` sets its own spec block. So the
selector would have been replaced in the editor, which had two violations, and in the CLI, which
had one.

## Fix Applied

- `packages/eslint-config/no-matcher-cast.js` adds a rule of its own,
  `workspace/no-matcher-cast`. It reports an `as` or `<T>` cast on `expect.<matcher>(…)` or on
  `expect.not.<matcher>(…)`. `baseConfig` registers it for `**/*.{ts,tsx}`. Every workspace consumes
  that config, the CLI through `extends`. It has a different name from any workspace's
  `no-restricted-syntax`, so no block replaces it.
- Every site is now a typed expected object, so the matcher fills an `unknown` slot. Where the
  subject has a type the object is `Record<keyof T, unknown>` (`ProposalRow`, `SkillIndex`,
  `SavedStack`), where it has a context type that type is used (`IssueContext`,
  `Pick<Error, "cause">`), and otherwise it is `Record<string, unknown>`. The CLI cast was deleted.
  Nothing was disabled.

Proof, by `eslint --stdin` in api-mocks. The rule fired on `expect.not.objectContaining({}) as
unknown`, on `expect.closeTo(1, 2) as unknown as number`, on a parenthesised cast and on
`<unknown>expect.any(String)`. It stayed silent on uncast matchers, including `expect.not.*`, and on
`expect.getState() as unknown`. Before the fix it reported all 14 census sites, in all four
workspaces.

Not caught: a cast on a variable that holds a matcher. The rule only matches syntax, and the census
found no such cast. Nothing tests the rule itself. `packages/eslint-config` has no test runner, so a
selector that stopped matching would fail silently.

## Proposed Standard

None needed in prose, because the rule's message says what to do. A `RuleTester` spec for the
rule would catch a selector that stopped matching, but it needs a runner in
`packages/eslint-config`. That is an owner decision, because the package has no test pipeline today.
