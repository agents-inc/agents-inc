---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/eslint.config.js
  - packages/cli/tsconfig.scripts.json
  - packages/cli/package.json
standards_docs:
  - .ai-docs/reference/features/code-generation.md
  - .ai-docs/reference/monorepo-layout.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: scope-discipline-deferred
status: partial
partial_note: The cap is raised to 16 so `turbo lint` is green again, and the reasoning is in eslint.config.js. What is pending is the structural fix under "Proposed Standard" — moving tsconfig.scripts.json to scripts/tsconfig.json, which removes the carve-out and its ceiling entirely.
---

## What Was Wrong

Adding two files to `packages/cli/scripts/` turned `turbo lint` red with **no rule violated**:

```
Having many files run with the default project is known to cause performance issues…
✖ 1 problem (1 error, 0 warnings)
```

The error names nine files and no line in any of them. `eslint .` exits 1, and the failure is
reported against the run rather than against a file, so nothing in the output says which change
caused it.

The mechanism is a chain of three facts, each documented, none of them documented together:

1. `packages/cli/tsconfig.json` has `include: ["src/**/*"]`, so `scripts/` is in no config that
   typescript-eslint's project service can discover — the service only ever looks for a file named
   `tsconfig.json`, and this package's scripts project is `tsconfig.scripts.json`.
2. `eslint.config.js` therefore carves them out with `allowDefaultProject: ["scripts/*.ts"]`, which
   types them against TypeScript's inferred default project.
3. typescript-eslint caps default-project files at **8** and fails the run on the ninth. `scripts/`
   held seven. Two more made nine.

So the package had a working carve-out with a ceiling one file above its head, and the ceiling is
enforced as a run-level error rather than a per-file one.

## Fix Applied

`maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 16` in `eslint.config.js`, beside
the existing `allowDefaultProject` comment, with the mechanism written out and the real fix named.

The flag's shouted name is about linting a large tree with no project; this is nine build scripts
that lint in about a second, so raising it is proportionate. It is still a ceiling, only a higher
one.

## Proposed Standard

**A directory that needs its own TypeScript program should carry its own `tsconfig.json` rather
than a differently-named config at the package root.** `packages/cli/e2e/` already does exactly
this — `e2e/tsconfig.json` extends `../tsconfig.json` — which is why e2e files need no carve-out
and are subject to no cap. `scripts/` is the only one of the three programs in this package named
so that the project service cannot find it.

Moving `tsconfig.scripts.json` to `scripts/tsconfig.json` would delete the `allowDefaultProject`
entry, delete the cap, and type the scripts against the config that was written for them instead of
an inferred one. It was not done in the change that hit this because that filename is named in
**twelve** places: both typecheck scripts in `package.json`, `eslint.config.js`, a comment in
`tsconfig.json`, four reference docs and three earlier findings. That is a rename with a paper
trail, not a side effect of adding a script — but it is the only version of this that cannot fail
again on some future ninth, seventeenth or thirty-third file.
