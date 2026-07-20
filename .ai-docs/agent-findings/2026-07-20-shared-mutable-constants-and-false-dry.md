---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/consts.ts
  - src/cli/lib/matrix/matrix-loader.ts
  - src/cli/lib/skills/generators.ts
  - src/cli/lib/validation-result.ts
  - src/cli/lib/plugins/plugin-validator.ts
standards_docs:
  - CLAUDE.md
date: 2026-07-20
reporting_agent: cli-reviewer
category: dry
domain: shared
root_cause: missing-rule
status: resolved
---

# Deduplicating repeated literals into shared constants can create aliasing traps and hide false DRY

## What happened

A refactor pass replaced repeated object literals with shared exported constants. Two of them held
**mutable** arrays and were handed to callers **by identity**:

- `EMPTY_RELATIONSHIPS` (`consts.ts`) — five mutable arrays, stored into every `SkillRulesConfig`
  whose source data had no `relationships`. `loadSkillRules` is exported through `lib/matrix/index.ts`
  and consumed by `loading/source-loader.ts`, so the one shared object genuinely escaped across three
  modules.
- `VALID_EMPTY` (`validation-result.ts`) — mutable `errors` / `warnings`, returned from four sites in
  `plugin-validator.ts`.

Neither was a live bug: a repo-wide grep for `.push(` on those fields returned zero hits, and
`mergeRelationships` spread-copies rather than mutating. Both were latent traps — one `push` anywhere
would have corrupted every holder.

## Two corrections worth recording

**This was not newly introduced.** `git show HEAD` shows `plugin-validator.ts` already had a
module-local `const EMPTY_RESULT: ValidationResult = {...}`. The refactor did not create the aliasing;
it **widened the blast radius** from module-private to cross-module exported. Reviewers framing this as
a new defect were wrong about its origin, and that distinction matters when judging a refactor.

**A factory is not automatically the right fix.** It removes the mutation trap but preserves whatever
coupling the shared constant created. Judge the coupling first.

## The false-DRY smell

`EMPTY_RELATIONSHIPS` carried this JSDoc:

> "Kept without `compatibleWith` so the generated skill-rules.ts stays byte-identical"

That comment is the tell. It documents a **cross-module constraint**: the _generator's_ output format was
constraining the _loader's_ runtime default. The two call sites look identical but have different reasons
to change — one is a runtime default for an absent config field, the other is a template for a generated
source file. They were never the same concept.

**A JSDoc comment that has to explain a cross-module constraint on a shared constant is evidence the
constant is false DRY.** Identical-looking literals are not necessarily the same concept.

## Resolution

Different fix per site, chosen after tracing consumers:

- `EMPTY_RELATIONSHIPS` — **deleted; reverted to independent literals** at both sites. Cost: ten
  duplicated lines. Gain: no singleton, no cross-module coupling, no import, no type changes.
- `VALID_EMPTY` — **converted to a factory** `validResult()`. Here the named concept was worth keeping,
  and the module already exposed `invalidResult(message)` beside it; a const paired with a factory was the
  real inconsistency. `validResult()` / `invalidResult(msg)` now read as one API.

Rejected: `as const` / `readonly` (the fields are mutable on `RelationshipDefinitions` and
`ValidationResult`, so it cascades into widely-used types), and `Object.freeze` (runtime-only, invisible
to the type system, silently no-ops outside strict mode).

## Proposed rule

For CLAUDE.md, under **NEVER do this → Code Style**:

> - NEVER export a shared constant holding mutable arrays/objects that callers receive by identity — one
>   `push` corrupts every holder. Use a factory returning a fresh value, or leave independent literals in
>   place. When deduplicating repeated literals, first ask whether the sites have the _same reason to
>   change_; if a JSDoc has to explain a cross-module constraint on the shared value, that is false DRY.

## Related

- `types/config.ts` `ValidationResult.errors/warnings` and `types/matrix.ts` `RelationshipDefinitions`
  fields are mutable arrays. Making them `readonly` would give type-level immutability but cascades
  repo-wide — a separate, deliberate decision, not done here.
