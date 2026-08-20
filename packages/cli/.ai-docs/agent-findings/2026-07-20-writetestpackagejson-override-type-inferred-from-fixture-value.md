---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/__tests__/helpers/config-io.ts
  - src/cli/lib/__tests__/mock-data/mock-source-files.ts
  - e2e/commands/build.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: typescript
domain: shared
root_cause: convention-undocumented
status: partial
partial_note: >-
  CODE - landed, and re-derived against source on 2026-08-19 rather than inferred from this file.
  `TestPackageJsonOverrides` is now declared in `src/cli/lib/__tests__/helpers/config-io.ts` as
  `Partial<Omit<typeof VALID_PACKAGE_JSON_FILE, "author"> and an author union>`, so the object form
  passes with no cast; its own docblock records that three specs had been paying for the inference
  with a double cast. `grep -rn 'as unknown as string' e2e/ src/` returns one hit and it is that
  docblock naming the retired idiom, so the class is swept rather than merely the instance. The
  implementation differs from proposal 1 - the fixture itself is still untyped and the union sits on
  the overrides type - which reaches the same result by a shorter route. DOCS - owed. Proposal 2,
  the general rule that an overrides type must not be derived from a fixture VALUE, is written into
  no standards document; `grep -rn 'Partial<typeof' .ai-docs/standards/` returns nothing. This
  finding calls that half the more important one, because the idiom is compact and attractive and
  will recur in the next helper.
---

## What Was Wrong

`writeTestPackageJson` types its overrides parameter as
`Partial<typeof VALID_PACKAGE_JSON_FILE>`. `VALID_PACKAGE_JSON_FILE` is a plain
object literal (no `as const`, no `satisfies`), so every field's type is inferred
from the one happy-path value that fixture happens to hold. `author` holds the
string `"Test Author <test@example.com>"`, so the override type for `author` is
`string` and nothing else.

The production schema that `build marketplace` uses accepts `author` in two
shapes: a string (`"Name <email>"`) and an object (`{ name, email, url }`). A
negative/variant-case E2E test therefore cannot express the object form through
the helper at all. The only way through the type is a double cast, which is
exactly what `e2e/commands/build.e2e.test.ts` does in "should parse object-form
author with name+email+url":

```ts
author: {
  name: "Jane Doe",
  email: "jane@example.com",
  url: "https://jane.example.com",
} as unknown as string,
```

CLAUDE.md bans `as unknown as T` double casts outright ("fix the upstream type
instead"), but here the upstream type is not written down anywhere — it is a
by-product of a fixture's sample data. The cast is not a local sloppiness; it is
the only expressible workaround, so a reviewer sweeping for double casts will
keep re-finding it and keep being unable to remove it.

The general shape of the gap: **a test helper whose parameter type is inferred
from a fixture VALUE silently narrows to that value's type, so the helper can
only ever build the happy-path variant.** Any override that legitimately differs
in type — which is the entire purpose of an overrides bag on a negative-case
helper — is forced through a cast.

## Fix Applied

None — discovery only, and deliberately so.

This was found during the Pass 8 / Cluster G round-3 sweep, whose assignment
directed removing the double cast on the premise that the `author` option "was
widened this round". Two things about that premise turned out to be stale, both
verified against the current tree rather than assumed:

1. **Wrong file.** The assignment placed the type in `e2e/helpers/test-utils.ts`.
   That file only re-exports `writeTestPackageJson`; the declaration lives in
   `src/cli/lib/__tests__/helpers/config-io.ts` and the type originates in
   `src/cli/lib/__tests__/mock-data/mock-source-files.ts`.
2. **The widening never landed.** Confirmed with a compiler probe (passing the
   object form with no cast) rather than by reading alone:
   `TS2322: Type '{ name: string; email: string; url: string; }' is not
assignable to type 'string'.`

The cast was therefore left in place per the assignment's own fallback
instruction, and the owning files were not touched — they are outside the
sweep's file ownership.

## Proposed Standard

Two changes, both cheap:

**1. Give `VALID_PACKAGE_JSON_FILE` an explicit shape rather than an inferred
one.** Declare the package.json fixture against a named type whose `author` is
`string | { name: string; email?: string; url?: string }`, matching what the
production Zod schema actually accepts. Then
`Partial<PackageJsonFixture>` lets the E2E test pass the object form directly and
the double cast deletes itself. This also makes the fixture's contract legible:
today you have to know that a marketplace author may be an object, because the
fixture does not say so.

**2. Write the general rule down.** Add to
`.ai-docs/standards/e2e/anti-patterns.md`, in the test-fixture section:

> **Do not derive an overrides type from a fixture value.** When a test helper
> takes an overrides bag (`overrides: Partial<typeof SOME_FIXTURE>`), the
> parameter type collapses to the types of whatever sample values that fixture
> happens to hold. Variant-case tests — which are the reason the overrides bag
> exists — then cannot express any value whose type differs, and are pushed into
> `as unknown as T` casts that CLAUDE.md bans. Declare the fixture against an
> explicit named type that covers every shape the production parser accepts, and
> derive the overrides type from that type instead of from the value.

Recording the rule matters more than the one-line fix: `Partial<typeof FIXTURE>`
is an attractive, compact-looking idiom, so this will recur in other helpers
unless it is named as an anti-pattern.
