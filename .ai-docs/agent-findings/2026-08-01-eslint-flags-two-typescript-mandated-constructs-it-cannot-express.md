---
type: standard-gap
severity: low
affected_files:
  - e2e/helpers/node-pty.d.ts
  - e2e/matchers/setup.ts
  - eslint.config.js
standards_docs:
  - CLAUDE.md
date: 2026-08-01
reporting_agent: cli-tester
category: typescript
domain: infra
root_cause: enforcement-gap
status: partial
partial_note: >
  Code side landed as two targeted inline disables, each with the compiler error that proves the
  construct is mandatory. Pending: the config-level fix in eslint.config.js, which this agent does
  not own. Both disables should be deleted once the two overrides in "Proposed Standard" land.
---

## What Was Wrong

Two of the sixteen ESLint errors in `e2e/` were not defects. They are constructs TypeScript
**requires** you to write in exactly the shape the lint rule objects to, and in both cases the
rule's own escape hatch does not work. They are the only two in the sweep that could not be fixed by
either deleting something dead or adding a missing assertion.

**1. `@typescript-eslint/triple-slash-reference` on `e2e/helpers/node-pty.d.ts`.** The file is a
single `/// <reference path=... />` pointing at the type declarations inside `@lydell/node-pty`. The
rule says to use an `import` instead. An `import` is not equivalent here, for three separate
reasons:

- The package ships `"exports": "./index.js"` with no `types` condition, so TypeScript cannot reach
  its declarations through normal module resolution at all. Deleting the reference line produces
  four errors in `terminal-session.ts`, headed by TS7016: _"There are types at
  `node_modules/@lydell/node-pty/node-pty.d.ts`, but this result could not be resolved when
  respecting package.json exports."_ The reference is load-bearing, not decorative.
- The package's declaration file is an **ambient** `declare module '@lydell/node-pty'`, which only
  enters the program when the file is pulled in as a global script. A triple-slash reference does
  that; an import does not.
- Adding any `import` to `node-pty.d.ts` would turn it from a global script into a module, at which
  point it stops contributing globals — the opposite of what it is for. And the `.d.ts` path cannot
  be imported directly regardless (TypeScript rejects `.d.ts` in an import specifier, and the
  package's single-string `exports` blocks the subpath).

The only "fix" that satisfies the rule is hand-copying the package's type declarations into our
repo, which trades a one-line reference for a duplicate that silently rots on every dependency bump.
That makes the types worse, so it was not done.

**2. `@typescript-eslint/no-unused-vars` on the `T` in `interface Assertion<T>` in
`e2e/matchers/setup.ts`.** This is the declaration merging that registers our custom Vitest matchers
(`toHaveConfig`, `toHaveCompiledAgent`, and eleven more) with the type system. None of the added
methods uses `T`, so the rule flags it. The rule's documented escape hatch is to prefix the name
with `_`, and **that does not compile**: TS2428, _"All declarations of 'Assertion' must have
identical type parameters."_ TypeScript matches merged declarations on the type parameter's NAME, so
it must stay `T` verbatim to match Vitest's own `Assertion<T>`. Verified by trying it.

There is no way to "use" `T` here without inventing API. This is a general property of interface
augmentation, not something about our matchers — any project that merges into a generic third-party
interface hits it.

## Fix Applied

A targeted `eslint-disable-next-line` on each, with a comment recording the compiler error that
proves the construct is mandatory (TS7016 for the reference, TS2428 for the type parameter) and why
the rule's suggested alternative does not work. No rule was disabled file-wide or project-wide, and
no type plumbing was restructured. `npx eslint e2e` and `npx tsc --noEmit -p e2e/tsconfig.json` are
both clean.

These are the only two `eslint-disable` comments in `e2e/`. The other fourteen errors in the sweep
were fixed by removing dead bindings or adding missing assertions — see
`2026-08-01-e2e-specs-captured-exit-codes-and-config-snapshots-then-asserted-nothing.md`.

## Proposed Standard

Both disables are working around a config gap, and the config is the right place to fix it. Two
overrides in `eslint.config.js`, after the main `TYPESCRIPT_SOURCES` block:

```js
// Ambient declaration files exist to contribute globals. A triple-slash
// reference is the only construct that does that; `import` turns the file
// into a module and it stops declaring anything globally.
{
  files: ["**/*.d.ts"],
  rules: { "@typescript-eslint/triple-slash-reference": "off" },
},
```

For the second, the rule needs to stop reporting unused type parameters, which it currently has no
dedicated option for. Either scope an override to the files that do interface augmentation, or —
better, because it generalises — check whether the installed `typescript-eslint` supports
`reportUnusedTypeParameters` / an equivalent, and if not, keep the inline disable as the narrower of
the two evils. Do **not** widen `varsIgnorePattern`: the `^_` convention is what makes an
intentional unused binding readable everywhere else, and it is exactly the convention TS2428 blocks
here.

Whichever lands, delete the corresponding inline disable — an override plus a redundant disable is
worse than either alone.

Add to CLAUDE.md § "Code Style", since this is the first legitimate `eslint-disable` in the test
tree and the bar for the next one should be explicit:

> An `eslint-disable` is permitted only when the construct is **required** by TypeScript and the
> rule's own escape hatch does not compile. The comment must name the compiler error that proves it
> (e.g. TS2428, TS7016) and say what the rule's suggested alternative breaks. "The rule is annoying
> here" is not a reason; neither is "the fix is a big refactor". If a config-level override is the
> real answer, the disable is a placeholder — file a finding naming the override so it gets removed.
