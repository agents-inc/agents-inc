---
type: standard-gap
severity: low
affected_files:
  - apps/editor/tsconfig.node.json
  - packages/matrix/tsconfig.json
  - packages/vitest-config/node.js
standards_docs:
  - .ai-docs/standards/typescript-config.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: "vitest.config.ts added to the include of apps/editor/tsconfig.node.json and packages/matrix/tsconfig.json, with allowJs so the untyped @workspace/vitest-config resolves"
---

## What Was Wrong

Turning on type-aware linting surfaced two parse errors rather than rule violations:
`apps/editor/vitest.config.ts` and `packages/matrix/vitest.config.ts` were "not found by the
project service" — that is, **they are in no tsconfig at all**. `apps/editor/tsconfig.node.json`
included only `vite.config.ts`; `packages/matrix/tsconfig.json` included only `src` and `scripts`.

Under the previous non-type-aware config this was silent: ESLint parsed and linted them with no
program, and `tsc` never saw them. Neither gate said anything. `apps/server` had it right all along
— its tsconfig lists `vitest.config.ts` in `include` — so the repository already held both the
defect and its fix.

Adding them to `include` then exposed the second half: `@workspace/vitest-config` ships
`node.js` as plain JavaScript with no `types` condition in its `exports`, so `nodeConfig` arrived
as an implicit `any` and `tsc` failed with TS7016.

## Fix Applied

Both files added to their workspace's `include`, matching `apps/server`. `allowJs: true` added to
the two tsconfigs so TypeScript infers `nodeConfig`'s type from the source it already resolves.

`allowJs` was chosen over hand-writing a `node.d.ts` deliberately: a hand-written declaration for a
dependency is a second copy of a type that rots the first time the original changes.
`packages/cli/eslint.config.js` already argues exactly this in its `triple-slash-reference` block
("the only rule-satisfying alternative is hand-copying the vendor's declarations into the repo,
where they rot on the next dependency bump"). `checkJs` stays off — reading the config is not
type-checking it.

## Proposed Standard

A short rule for `typescript-config.md`: **every file a workspace lints must be in one of that
workspace's tsconfigs.** Root-level tool configs — `vite.config.ts`, `vitest.config.ts`,
`playwright.config.ts` — are the ones that fall through, because `include` is usually written to
name the source directory and nothing else. Under type-aware linting a file in no project is a
parse error rather than a skipped file, so the omission stops being silent — but it is worth
stating rather than rediscovering.

Worth noting for whoever picks up `@workspace/vitest-config`: it is the only shared config package
here whose export is consumed from TypeScript, and so the only one where the missing `types`
condition is felt. `@workspace/prettier-config` has the same shape and no consumer that cares.
