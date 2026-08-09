---
type: standard-gap
severity: low
affected_files:
  - packages/cli/eslint.config.js
  - packages/eslint-config/base.js
standards_docs:
  - .ai-docs/reference/monorepo-layout.md
date: 2026-08-08
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: rule-not-visible
status: resolved
resolved_by: "packages/cli's no-unused-vars override restates ignoreRestSiblings alongside its own caughtErrorsIgnorePattern, and the equivalence method that found it is written up in monorepo-layout.md's fourth-check subsection"
---

## What Was Wrong

CLI-427 replaced `packages/cli`'s hand-composed rule set with `extends: [baseConfig,
typeCheckedConfig(...)]`. The obvious risk was rules that would newly fire. The real finding was the
opposite: **a rule the workspace already states by name inherits none of the shared config's options
for it.**

`packages/eslint-config/base.js` sets:

```js
"@typescript-eslint/no-unused-vars": [
  "error",
  { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
],
```

`ignoreRestSiblings` is there with a comment naming the idiom it exists to allow
(`const { [id]: _removed, ...rest } = obj`). `packages/cli` states the same rule with its own
options object — `argsIgnorePattern`, `varsIgnorePattern`, `caughtErrorsIgnorePattern` — and ESLint
does not merge two options objects for one rule. The last config block to name a rule owns **all**
of its options. So extending the shared base, on its own, would have left `ignoreRestSiblings` off
in the one package that had just been wired up to inherit it.

This is the same defect CLI-427 was raised to fix, one level down. CLI-427: the workspace did not
extend, so it did not get the shared _rules_. This: the workspace extends, but where it also names
a rule it does not get that rule's shared _options_. Nothing fails in either case — the config is
valid, the lint is clean, and the only symptom is a rule doing less than the shared config says it
should.

The `eslint.config.js` file already knew this mechanic and had written it down for a different rule:
`no-restricted-imports` "takes ONE options object per file and the last config block wins, so a zone
that relaxes one restriction must restate the others". The rule is general; the note was local.

## Fix Applied

`packages/cli`'s override restates the shared options and adds only what is genuinely local:

```js
"@typescript-eslint/no-unused-vars": [
  "error",
  {
    argsIgnorePattern: "^_",
    varsIgnorePattern: "^_",
    ignoreRestSiblings: true,      // the shared base's, restated so extending does not drop it
    caughtErrorsIgnorePattern: "^_", // the one addition — clean-code-standards 9.6
  },
],
```

**How it was caught, which is the transferable part.** The restructure was verified by dumping
`eslint --print-config` for one representative file per config zone — sixteen of them, covering
production `.ts`, `.tsx`, the React-hooks zones, tests, `__tests__`, `e2e`, `scripts`, `.d.ts`, the
config file itself and all five config-gate zones — before and after, and diffing. The whole diff
across all sixteen was one added line, `"ignoreRestSiblings": true`. That method turns "did
extending change anything?" from a judgement into a diff, and it is the only reason a silently
dropped option was visible: a violation count would have shown nothing, because the option loosens.

`bunx eslint .` reported 606 files, 0 errors, 0 warnings both before and after, and the set of files
linted was identical — the shared configs match `**/*.{ts,tsx}`, and the CLI's `files:
TYPESCRIPT_SOURCES` narrows them back to what this package compiles, which is what keeps
`tsup.config.ts`, `vitest.config.ts` and `vitest.setup.ts` — in no tsconfig of this package — out of
a type-aware run they would fail to parse under.

## Proposed Standard

1. **A shared config's rule options are inherited only where the workspace stays silent about that
   rule.** Worth one line in `monorepo-layout.md`'s new fourth-check subsection: if a workspace
   overrides a rule the shared config also sets, it owns every option, and the override must restate
   the shared ones. The new `deps:check` axis cannot see this — it asserts the _import_, not the
   resolved rule set.
2. **Prove a config restructure with `--print-config` per file class, not with a violation count.**
   A count catches rules that start firing; it is blind to a rule that quietly starts doing less.
   The dump-and-diff harness is cheap — one `--print-config` per representative file — and it is
   what makes "equivalent or better" a checkable claim instead of an assertion.
