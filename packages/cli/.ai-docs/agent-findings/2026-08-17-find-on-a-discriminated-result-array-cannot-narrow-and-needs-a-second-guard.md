---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/src/lib/api/skill-contents.ts
  - apps/editor/src/features/configure/components/add-skill-dialog.tsx
standards_docs:
  - .ai-docs/standards/typescript.md
date: 2026-08-17
reporting_agent: web-developer
category: typescript
domain: web
root_cause: convention-undocumented
status: partial
partial_note: >-
  The code-side fix landed in both files during EDITOR-03. What is pending is the written rule —
  nothing in the repository's TypeScript standards names this shape, and ESLint only catches half
  of it.
---

## What Was Wrong

The repository's `{ ok: true, … } | { ok: false, … }` result type is everywhere, and the natural way
to ask "did any of these fail?" over an array of them does not narrow:

```ts
const fetched = await Promise.all(blobs.map(fetchFile));

const failed = fetched.find((file) => !file.ok);
// `failed` is the WHOLE union, not the failing branch — `.find`'s signature returns
// `T | undefined`, and the predicate's narrowing is not carried out of the callback.
if (failed && !failed.ok) return failed.failure;
```

The `&& !failed.ok` is dead at runtime — `find` already established it — and exists only to
re-narrow for the compiler. It reads as a defensive check on something that cannot happen, which is
exactly what the repository's "no silent fallbacks" rule teaches a reader to distrust. The next
person either deletes the second half and breaks the build, or leaves it and wonders what case it
covers.

I wrote this shape twice in one session, in two files, without noticing the first one. ESLint caught
one of them — `@typescript-eslint/no-unnecessary-condition` fires on `failed && …` because `find`'s
result is checked for `undefined` and then again for `ok` — and did **not** catch the other, because
there the union's two branches differed enough that the second condition was not provably redundant.
So half of this class fails the gate and half ships.

## Fix Applied

Both sites became the walk they actually are: one loop, an early return on the first failure, and
the accumulator built as it goes. The narrowing is free because `if (!x.ok) return` narrows `x` for
the rest of the block.

```ts
const files: Record<string, string> = {};
for (const file of fetched) {
  if (!file.ok) return file.failure;
  files[file.relative] = file.text;
}
```

This is shorter than the `find` + `flatMap` pair it replaced (which needed a second `file.ok` guard
inside the `flatMap` for the same reason), does one pass instead of two, and states the all-or-
nothing rule in the shape of the code rather than in a comment beside it.

`Promise.all` still runs the fetches in parallel — the sequential-looking loop is over results that
have already settled, which is the distinction worth keeping in mind when reading it.

## Proposed Standard

Add to `.ai-docs/standards/typescript.md`, in the section on discriminated results:

> **Do not use `.find()` to look for a failure in an array of discriminated results.** `Array.find`
> returns `T | undefined` and does not carry the predicate's narrowing out of the callback, so every
> use needs a second guard that is dead at runtime — and a dead guard is indistinguishable from a
> real one to the next reader. Walk the array with a `for…of` and an early return instead. An
> `if (!item.ok) return item.failure` narrows for the remainder of the body, builds the success
> list in the same pass, and states the all-or-nothing rule structurally.
>
> The same applies to `.filter()` + `flatMap` pairs over a result union: the `flatMap` callback needs
> its own `ok` check for narrowing, which duplicates the filter's predicate.
>
> `no-unnecessary-condition` catches some of these and not others, depending on how much the two
> branches of the union differ. Do not treat a green lint as evidence the shape is absent.

Two notes for whoever writes it up:

- The rule is about arrays specifically. A single result reads fine as
  `if (!result.ok) return result.error` and needs nothing.
- A type predicate (`(file): file is Extract<FileResult, { ok: false }> => !file.ok`) also makes
  `.find` narrow, and is worse: it restates the discriminant in a second place, so a third variant
  added to the union type-checks and is silently skipped.
