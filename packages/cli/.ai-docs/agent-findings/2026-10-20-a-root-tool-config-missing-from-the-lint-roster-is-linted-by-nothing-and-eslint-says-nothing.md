---
type: convention-drift
severity: low
affected_files:
  - eslint.config.js
  - vitest.loadtime.config.ts
  - vitest.loadtime.preload.setup.ts
  - vitest.mutation.config.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-20
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: premise-expired
status: resolved
resolved_by: >-
  The three files are in ROOT_TOOL_CONFIGS, the load-time list is parsed with a zod schema and the
  mutation config's export is typed. src/cli/lib/__tests__/root-tool-configs-are-linted.test.ts
  holds every root file tsconfig.json includes to a lint config, and names the three when they are
  taken out of the roster.
---

## What Was Wrong

`eslint.config.js` lints the package-root tool files only when `ROOT_TOOL_CONFIGS` names them, one
by one, so a stray harness at the root stays unlinted. The roster was right for the four root
configs it was written for. Three root configs added since are in `tsconfig.json`'s `include`, so
they are type-checked, but `ROOT_TOOL_CONFIGS` does not name them, so ESLint lints none of them.

Census, run from `packages/cli` over every root `.ts`/`.js`/`.mjs` file:

```
for f in $(ls -1 | grep -E '\.(ts|mts|mjs|cjs|js)$'); do echo "$f -> $(npx eslint --print-config "$f" 2>/dev/null | head -c 9)"; done
```

Three answer `undefined`: `vitest.loadtime.config.ts`, `vitest.loadtime.preload.setup.ts`,
`vitest.mutation.config.ts`. `eslint .` (the package's `lint`) skips a file no block matches without
a word. Only a file passed by name gets the "File ignored because no matching configuration was
supplied" warning, and even then the exit code is 0.

The gap is not empty. Linted with the same base and type-checked blocks as the other root configs
(a probe config outside the tree), `vitest.loadtime.config.ts` reports two
`@typescript-eslint/no-unsafe-assignment` errors: the unvalidated `JSON.parse` of
`vitest.loadtime.files.json`, and `...mutationConfig.test`. The other two files are clean.

## Fix Applied

None, discovery only. The lane was a comment and export pass that changed no code.

## Proposed Standard

Add the three files to `ROOT_TOOL_CONFIGS` and clear the two errors, parsing the list with a schema
since it is a parse boundary. Then hold the roster against something that moves on its own:
`tsconfig.json`'s root `include` entries already list every root tool config. A spec beside
`spec-gates.test.ts` could assert, through the ESLint API it already uses, that every root file
`tsconfig.json` includes has a config. That fails on the next root config added without a roster
entry. This does not conflict with `clean-code-standards.md`, whose dist-staleness paragraph assumes
the root tool files are in both lists.
