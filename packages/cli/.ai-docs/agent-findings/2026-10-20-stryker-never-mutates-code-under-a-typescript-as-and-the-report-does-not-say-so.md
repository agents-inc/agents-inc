---
type: missing-standard
severity: medium
affected_files:
  - src/cli/lib/config-gate/classify.ts
standards_docs:
  - docs/architecture.md
date: 2026-10-20
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: missing-rule
status: partial
partial_note: >-
  Docs side landed 2026-10-20, one sentence in docs/architecture.md, Mutation testing, saying such
  code is broken by hand. Code side open. Sites under an as were broken by hand only in
  packages/compile/src/seed-to-config.ts's changed lines (19, 17 caught; see
  2026-10-21-a-hand-mutant-under-an-as-can-be-served-to-one-suite-without-writing-the-shared-tree),
  and nothing notices when a Stryker release starts mutating them.
---

## What Was Wrong

StrykerJS never mutates code under a TypeScript `as`, and the run does not say so. In the installed
`@stryker-mutator/instrumenter` 10.0.0, `isTypeNode` (`dist/src/util/syntax-helpers.js`) lists
`TSAsExpression` among the type-only nodes, so `shouldSkip` in
`dist/src/transformers/babel-transformer.js` is true for it and the traversal calls `path.skip()`.
That skips the whole subtree: the expression the type is asserted on as well as the type.
`x as const satisfies T` parses as `(x as const) satisfies T`, so it is skipped too. `satisfies`
alone is not.

Measured 2026-10-20 with a real `stryker run` (command test runner, default options) on a scratch
project:

- `["author", "agentsDir"] as const`, the same list `as const satisfies readonly string[]`, and an
  arrow function cast with `as`: 0 mutants each. The files are absent from the JSON report, with no
  Ignored entry and no warning.
- `(config.skills ?? []) as readonly string[]` in a function: only the whole-function
  `ArrowFunction` mutant, with no `LogicalOperator` for `??` and no `ArrayDeclaration` for `[]`. The
  same function with a return type annotation instead of the cast gets both.
- The list with `satisfies` alone, or with a type annotation: mutated.

So it is not only lists. In this package, `(config.skills ?? []) as SkillConfig[]` in
`classify.ts` gets no `??` or `[]` mutant.

No setting changes it. The only options read on that path are `ignorers`, `excludedMutations` and
the mutate ranges, and `.ts` files are parsed with fixed settings (`mutator.plugins` reaches only
the JavaScript parser). The tests lane of the same pass also ran `ignoreStatic`,
`disableTypeChecks`, `mutator` options, a line range and the TypeScript checker: 0 mutants under
`as` in every run. No release changes it either: `npm view @stryker-mutator/instrumenter version`
answered 10.0.0, and the fix is stryker-js PR #6228, open and unmerged on 2026-10-20, as are the
issues it closes, #6208 and #6227.

Census, 2026-10-20: an AST scan of each config's mutate set, counting each `as` whose asserted-on
expression is more than a bare name or member. Not committed. It counts sites, not mutants, so it is
an upper bound. `stryker.config.json` 95, `stryker.editor.config.mjs` 38,
`stryker.compile.config.mjs` 36, `stryker.api-mocks.config.mjs` 10, `stryker.ui.config.mjs` 7,
`stryker.server.config.mjs` 5, `stryker.matrix.config.mjs` 3, `stryker.api.config.mjs` 0. A cruder
lead anyone can run, which also counts casts of a bare name and misses a cast split across lines:

```
grep -rnE '\bas (const\b|[A-Z(])' packages/cli/src --include='*.ts' --include='*.tsx' | grep -v -e '\.test\.' -e __tests__
```

## Fix Applied

The sentence in `docs/architecture.md` › "Mutation testing": code under `as` gets no mutant, so it
is broken by hand. No code changed, and no site was broken by hand.

## Proposed Standard

Applied as above. For the hand break: swap or drop a member the type still accepts. Under
`satisfies readonly (keyof T)[]`, Stryker's own `""` replacement is a `CompileError` under the
TypeScript checker (measured by the tests lane), so it says nothing about the tests.

Not in conflict with `CLAUDE.md`'s rule that an expected-value constant is written
`as const satisfies`: those constants live in test modules, which no mutate set includes (0 of the
census's sites are in one).

What would notice the sentence going stale: a test that runs the installed instrumenter over
`[…] as const` and expects 0 mutants, which goes red on the upgrade that starts mutating it. Not
built.
