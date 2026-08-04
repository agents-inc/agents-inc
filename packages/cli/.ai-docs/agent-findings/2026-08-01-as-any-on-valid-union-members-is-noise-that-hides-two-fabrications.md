---
type: anti-pattern
severity: medium
affected_files:
  - scripts/generate-source-types.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-08-01
reporting_agent: cli-developer
category: typescript
domain: infra
root_cause: rule-not-specific-enough
status: partial
partial_note: Code fix landed (all 38 `as any` removed from scripts/generate-source-types.test.ts, eslint gate green). Pending — the CLAUDE.md rule widening proposed below, and the regex-scan assertion described under "Secondary discovery" is untouched.
---

## What Was Wrong

An ESLint gate was enabled that had never run before. Every single
`@typescript-eslint/no-explicit-any` error in the repo — all 38 of them — lived in one
file: `scripts/generate-source-types.test.ts`. No other file violated the rule.

The interesting part is what the 38 turned out to be. **Thirty-six were casts on values
that were already valid members of the target union.** For example:

```ts
createMockExtractedSkill("web-framework-react", { slug: "react" as any })
{ id: "web-framework-react" as any, preloaded: true }
```

`slug` is `SkillSlug`, and `"react"` is in that union. `SkillAssignment.id` is `SkillId`,
and `"web-framework-react"` is in that union. Every one of these casts was pure noise —
deleting the cast type-checks with no other change. Nothing needed importing; the types
arrived contextually through `Stack` and through `createMockExtractedSkill`'s
`Partial<ExtractedSkillMetadata>` parameter. The types were always there. The casts were
suppressing type-checking the fixtures did not need suppressed.

The cost of that noise is the remaining two. Once thirty-six `as any`s are ambient
background, the two that were doing real work become invisible:

1. `{ id: "web-framework-nonexistent" as any }` — a fabricated skill ID, in the test
   `"filters out invalid skill IDs not in skillIdSet"`.
2. `{ slug: "react-alt" as any }` — a fabricated slug, in the duplicate-ID test.

Number 1 is a genuine test defect and worth stating plainly. `resolveStack`'s signature is
`(stack: Stack, skillIdSet: Set<string>)`, and `Stack.agents` bottoms out in
`SkillAssignment.id: SkillId`. **A non-union ID cannot reach `resolveStack` through any
type-checked path.** The test was constructing an input the type system forbids, and
`as any` was the only reason it compiled. The test asserted the right outcome for a
scenario that cannot occur.

The scenario that _can_ occur — and that this function exists to handle — is the exact
inverse: a _perfectly valid_ `SkillId` that is absent from `skillIdSet`. That happens on
every run where `defaultStacks` (type-checked against the previous generation's union)
references a skill the current skills source no longer provides. The test was aimed one
step past the real hazard.

The naming reinforced the misconception. The fixture set was called `VALID_IDS`, framing
the function's job as validity-checking. It is not; it is set membership over IDs that are
all already valid. That framing is what makes `as any` feel necessary to the next person —
if the set holds "the valid ones", you need something "invalid" to test the filter, and
the type system will not give you one.

## Fix Applied

All 38 removed. No `eslint-disable`, no `unknown`+guard, no commented cast — every one
resolved to a type that already existed and was already exported.

- **36:** deleted the cast. The literal string is the type.
- **1** (`web-framework-nonexistent`): replaced with `web-framework-svelte` — a real
  `SkillId`, in the same `web-framework` category, deliberately absent from the fixture
  set. This models the production scenario described above. `VALID_IDS` renamed to
  `KNOWN_SKILL_IDS`, with the absent ID as a named, typed constant
  (`const UNKNOWN_SKILL_ID: SkillId = ...`) so the contrast is stated rather than implied,
  and so a future rename of that skill breaks the build instead of silently weakening the
  test. Test name corrected: `"filters out invalid skill IDs not in skillIdSet"` ->
  `"filters out skill IDs not in skillIdSet"`. The IDs are not invalid; they are unknown
  to this run.
- **1** (`react-alt`): replaced with `"svelte"`, a real `SkillSlug`. The fixture's point is
  two entries sharing one ID under two different slugs — which is precisely the real
  duplicate-ID shape (two skill directories whose `SKILL.md` frontmatter `name` collides).

The one type import added is `SkillId`, for the named constant. Verified: `eslint scripts`
0 errors, `tsc --noEmit` 0, `tsc -p tsconfig.scripts.json --noEmit` 0,
`prettier --check scripts` clean, `vitest run scripts` 34/34 passing (same count as before).

**No assertion stopped compiling.** Every existing assertion was correct about the values
it checked. The defect was in the inputs, not the expectations.

## Secondary discovery — not fixed

The same file's `"deduplicates agent names"` test does this:

```ts
const agentSection = content.slice(content.indexOf("AGENT_NAMES = ["));
const matches = agentSection.match(/"web-developer"/g);
expect(matches).toHaveLength(1);
```

That is a local slice-and-regex-scan over generated output, which CLAUDE.md's Test
Assertions section forbids outright ("NEVER define local parser/extractor helpers inside a
test file (loops, regex scans...)"). Left untouched — it is not an `any`, and rewriting it
correctly needs a decision about what the real contract is (probably an inline snapshot of
the `AGENT_NAMES` block). Flagging rather than half-fixing.

## Proposed Standard

Two changes, both to CLAUDE.md.

**1. Widen the existing cast rule to name `as any`.** The rule under "Type Safety & Casts"
currently reads:

> NEVER use `as SkillId` or `as SkillSlug` casts on valid union members — the literal
> string IS the type.

It names the two narrowing casts and stops. `as any` on a valid union member is the same
defect and strictly worse — it disables checking of the whole expression rather than
redirecting it — yet a reader applying the rule literally will not see it covered. Thirty-six
instances survived in a file whose author plainly knew about union types. Suggested wording:

> NEVER cast a valid union member — not `as SkillId`, not `as SkillSlug`, and not `as any`.
> The literal string IS the type. `as any` on a union member is the same defect as
> `as SkillId` with the type-checking of every sibling property switched off as well.
> Only cast at parse boundaries (YAML, JSON, CLI args) or for deliberately invalid
> error-path test data.

**2. Add a rule for fabricated test IDs, under "Test Data".** The existing guidance
("Fabricated test IDs that aren't in the union should use `string` type, not casts") covers
the _typing_, but not the prior question of whether the fabrication should exist. State the
prior question:

> Before fabricating an out-of-union ID for a test, check whether the function's signature
> can even receive one. If the parameter is typed to the union, a non-union value is
> unreachable in production and the test is asserting about an impossible input — use a real
> union member that fails the runtime check instead (e.g. a valid `SkillId` absent from the
> set being tested). Reach for `string`-typed fabrications only where the boundary genuinely
> accepts unvalidated input, such as `renderSkillMd(id: string, ...)`.

**3. Enforcement note.** The root cause behind both is that `scripts/` sat outside the lint
perimeter until now — 38 errors in one directory, 0 everywhere else, is the signature of an
unenforced path rather than of one careless author. Worth confirming that any future
top-level directory is added to the ESLint and typecheck globs at creation time;
`scripts/` needed a separate `tsconfig.scripts.json` project and was evidently added to
that but not to lint.
