---
type: convention-drift
severity: low
affected_files:
  - packages/compile/src/config-source.ts
  - packages/compile/src/contract/emission-scenarios.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-26
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  The union was written, measured against all four projects, and rejected;
  `generateConfigSource` refuses the invalid pairing at runtime instead, in
  `generateProjectConfig`, and `ConfigSourceOptions`'s docblock records the
  rejected shape and the compiler message it produces so it is not
  re-attempted.
---

## What Was Wrong

`ConfigSourceOptions` in `packages/compile/src/config-source.ts` is three flat optional fields, and
one of the eight combinations it admits was answered rather than refused:
`{ isProjectConfig: true }` with neither `globalConfig` nor `globalImportPath` fell through to the
standalone writer, which runs with `dropProjects: false` — so asking for a project config returned
a global-shaped one carrying the global `projects` tracking array that a project root must never
hold. `packages/cli/CLAUDE.md` forbids exactly this shape ("NEVER build multi-tier resolution
fallbacks… Data matches on the first lookup or it's an error"), and the repository's usual answer
is to make the invalid pairing **unrepresentable**.

The union was written first, because that is the stated preference:

```ts
export type ConfigSourceOptions =
  | { isProjectConfig?: false; globalConfig?: undefined; globalImportPath?: undefined }
  | { isProjectConfig: true; globalConfig: ProjectConfig; globalImportPath?: undefined }
  | { isProjectConfig: true; globalConfig?: undefined; globalImportPath: string };
```

It compiles, it narrows correctly inside `generateConfigSource`, and `packages/cli`'s `tsc
--noEmit` and `tsc -p e2e/tsconfig.json --noEmit` both stay at zero errors. It breaks the one place
that builds the options object in a variable:

```
$ cd packages/compile && npx tsc --noEmit
src/contract/emission-scenarios.test.ts(41,64): error TS2345: Argument of type
  '{ isProjectConfig: boolean; globalConfig: ProjectConfig; } | undefined' is not assignable to
  parameter of type 'ConfigSourceOptions | undefined'.
      Types of property 'isProjectConfig' are incompatible.
        Type 'boolean' is not assignable to type 'true'.
```

**The mechanism is the union's own discriminant.** Discriminating on `isProjectConfig` requires its
LITERAL types, and an object literal assigned to an un-annotated `const` has no contextual type, so
`{ isProjectConfig: true, … }` widens to `boolean` and matches no arm. The call site is correct in
every way that matters — right shape, right values, guarded — and the error names inference rather
than the mistake the union was added to prevent. The three arms cannot avoid it: discriminating on
`globalConfig`'s presence instead leaves `{ isProjectConfig: true }` legal in the first arm, which
is the whole defect.

This generalises
`2026-08-26-a-discriminated-union-on-component-props-collapses-storybook-args-to-never.md` off
component props. That finding's mechanism is Storybook intersecting the arms and is scoped to a
type a tool reflects over as one flat object; this is a plain exported data type with no tool
anywhere near it. What the two share is the shape of the cost: **the blast radius of a props/options
union lands in a file the union's author never opened, and is invisible to the module's own gates.**

## Fix Applied

The union was reverted and the invalid pairing is refused at runtime, in `generateProjectConfig` —
which is the function whose whole job is the three-way choice, so the refusal is that choice's
exhaustive arm rather than a guard bolted onto the orchestrator. The docblock on
`ConfigSourceOptions` carries the rejected union, the compiler message, and a pointer to the
component-props finding, for the same reason the `Hinge` docblock does.

Measured, not argued: the union cost exactly one file, and that file is a test the remediation lane
did not own. It would have been a one-line annotation (`const options: ConfigSourceOptions |
undefined = …`). Recording that here so the trade is legible if someone wants to revisit it — the
union's safety is real, and this is a note about its price, not a verdict that it is wrong.

## Proposed Standard

Into `.ai-docs/standards/clean-code-standards.md`, in the TypeScript section, as a second paragraph
under the existing props-union rule rather than a new one:

> **The same cost applies to any exported options type, not only to component props.** A
> discriminated union pays for its safety with the literal type of its discriminant, and an object
> literal assigned to an un-annotated `const` widens that literal to its base type — so the union
> that makes an invalid pairing unrepresentable also makes a VALID call at an un-annotated site
> stop compiling, with a message about inference. Before landing one on an exported type, run every
> workspace's typecheck, not the owning package's: the cost is invisible from the file that declares
> the union.

This does not conflict with CLAUDE.md's "structurally unrepresentable" guidance, which is about
persisted and reported data shapes; it prices the guidance for a type that crosses a package
boundary.

**What would catch a regression of the runtime refusal:** nothing today. No spec calls
`generateConfigSource` with `{ isProjectConfig: true }` and neither global field, and the developer
lane could not add one — the specs for this function are test files it did not own. The change
wanted is stated in the developer's report.
