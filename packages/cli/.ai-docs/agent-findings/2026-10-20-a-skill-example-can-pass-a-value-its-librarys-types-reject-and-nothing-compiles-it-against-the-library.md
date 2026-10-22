---
type: missing-standard
severity: low
affected_files:
  - ../skills/src/skills/web-forms-tanstack-form/examples/core.md
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
date: 2026-10-20
reporting_agent: skill-summoner
category: typescript
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

Pattern 3 of the TanStack Form skill called `form.setErrorMap({ onSubmit: getErrorMessage(error) })`
on a form with no validators. In `@tanstack/react-form` 1.33.5 `useForm`'s `TOnSubmit` has a
constraint and no default, so with no validator it infers the constraint, `UnwrapFormValidateOrFn`
resolves to `undefined`, and `setErrorMap`'s `onSubmit` key accepts only `GlobalFormValidationError`
(`{ form?, fields }`). The call reads naturally and runs — `setErrorMap` stores a value without
`fields` as-is — while the library's declarations reject it. That is derived from the published
`FormApi.d.ts` and `types.d.ts`, not from a `tsc` run: the agent had no shell.

Nothing in the skills repository sees this class. `bun run validate` reads `metadata.yaml` only, and
prettier parses a fence for syntax. The atomicity bible asks only that examples "compile
conceptually". The 2026-09-04 proposal of a linter over extracted blocks (INDEX row
`2026-09-04-a-skill-example-can-call-a-symbol-it-never-declares-and-nothing-opens-it`) finds
undeclared symbols. It cannot find a declared symbol given the wrong shape: only the library's own
types know the shape.

## Fix Applied

The argument became `{ form: getErrorMessage(error), fields: {} }`, the `GlobalFormValidationError`
shape.

## Proposed Standard

skill-atomicity-bible.md, beside "Examples must compile conceptually": a code block that calls a
library API is compiled against that library at the version the skill documents before it lands. The
block goes in a throwaway project with the package from npm, wrapped in a function with `declare`d
placeholders, under `tsc --noEmit`. The mechanised form is a skills-repo script extracting fenced
`ts`/`tsx` blocks per skill, which needs per-skill dependency pins the repository does not carry. Not
checked against the skills repository's CLAUDE.md: it is gitignored, and none exists in the working
tree.
