---
type: convention-drift
severity: medium
affected_files:
  - e2e/commands/compile.e2e.test.ts
  - e2e/interactive/refusal-lands-before-the-spinner.e2e.test.ts
  - e2e/lifecycle/init-edit-error-guards.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-16
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The five stale copy pins are fixed, and the spec names and assertion messages that described
  them moved with them. Two surfaces are documented here and deliberately not patched, per the
  document-first rule for sweeps. First, `LOCAL_SOURCE_NOT_FOUND` in
  `e2e/lifecycle/init-edit-error-guards.e2e.test.ts`, whose VALUE was re-pointed during CLI-463
  and whose NAME was not. Second, the `describe("stored source resolution")` heading in
  `e2e/commands/compile.e2e.test.ts`, which reads on the internal `resolveSource({ caller:
  "stored" })` path rather than on printed copy and is a judgement call the owner should make.
  Neither is an assertion, so neither can ever go red. The Proposed Standard below is written
  nowhere.
---

# A rename verified by a green suite leaves behind every surface the suite does not execute

## What Was Wrong

CLI-463 renamed the user-facing noun `source` to `marketplace`. Thirteen unit specs were
re-pointed and the unit suite went green — 139 files, 6368 passed, 0 failed. The implementing
agent was instructed not to run e2e, so the e2e siblings of those same thirteen were never
enumerated. Five of them still pinned the pre-rename copy, and were found only when the full e2e
suite was run afterwards:

| Spec file                                                       | Pinned                                   | Product now emits                       |
| --------------------------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| `commands/compile.e2e.test.ts` (×3)                             | `"Source: global"` / `"Source: project"` | `Marketplace: ${sourceOrigin}`          |
| `interactive/refusal-lands-before-the-spinner.e2e.test.ts` (×2) | `"Local source not found:"`              | `Local marketplace not found: '<path>'` |

That much is ordinary lag. What is worth writing down is the two surfaces the same rename left
behind that CANNOT go red, and so would not have been found by running anything.

**1. An identifier name on a constant whose value was already corrected.**
`e2e/lifecycle/init-edit-error-guards.e2e.test.ts` opens with:

```ts
const LOCAL_SOURCE_NOT_FOUND = "Local marketplace not found:";
```

The value was re-pointed during the CLI-463 pass. The name was not. Four assertions read it —
three `toContain` and one `not.toContain`, spread across the invalid-marketplace-flag spec, the
three flag-spelling cases, the withdrawn-`--source` refusal and the edit-with-missing-marketplace
spec — and all four are correct, so the file is green and stays green.

The reason this class survives every existing check is precise. `CLAUDE.md`'s standing rule is
"ALWAYS grep for the old value when changing test data or renaming anything", and grepping the
old value here (`Local source not found`) returns nothing, **because the value is exactly the
thing that was fixed**. The only surviving trace of the withdrawn noun is the identifier, and
neither `tsc`, `eslint` nor any spec run ever reads an identifier for meaning. The rule is not
wrong; it names the one surface that is guaranteed to be clean by the time the drift exists.

This is a fifth surface for the list in
`2026-08-16-the-marketplace-rename-stopped-at-typed-positions.md`, which enumerated four
(typed positions, persisted-key positions, untyped assertion literals, prose and option names).
That finding's fourth surface covers prose and helper OPTION names; it does not cover a copy-pin
constant whose value moved and whose name did not, and the distinction matters because the
detection strategy is the inverse: you find it by grepping the NEW value and reading what holds it.

**2. Spec and `describe` names.** Three `it` names in `compile.e2e.test.ts` described the
withdrawn noun ("should name the source global when compiling at the home root") while asserting
the surviving one, and three assertion messages said "the source came from …" about a line that
now prints `Marketplace:`. `.ai-docs/standards/e2e/README.md` requires test names to describe
BEHAVIOUR; a name describing behaviour in a vocabulary the product has withdrawn is a name that
will send the next reader looking for a surface that does not exist.

**Vacuous-pass check — none found.** Every remaining `source` literal in the e2e tree was read
against what it asserts on. The withdrawn-vocabulary negatives (`help.e2e.test.ts` ×4,
`doctor-content.e2e.test.ts`, `source-flag-is-init-only.e2e.test.ts`) are deliberate withdrawal
guards, each with a positive subject guard on the same captured output, and `doctor-content`'s is
line-anchored (`/^\s*Sources?(\s|$)/m` — an absolute path echoed into the output cannot start a
line with the word, so the negative reads the composed half only). The rest are variable
names (`localSource`, `pluginSource`, `configSource`), path fixtures, or `SkillConfig`/marketplace
prose. No negative in the tree passes vacuously on withdrawn wording.

## Fix Applied

`e2e/commands/compile.e2e.test.ts`, `describe("stored source resolution")`:

- `"Source: global"` → `"Marketplace: global"` (two specs), `"Source: project"` →
  `"Marketplace: project"` (one), matching `compile.ts`'s `` `Marketplace: ${sourceConfig.sourceOrigin}` ``.
- The three `it` names and the three assertion messages that described the old noun now describe
  the new one. No assertion changed subject, strength or scope.

`e2e/interactive/refusal-lands-before-the-spinner.e2e.test.ts`:

- The constant `LOCAL_SOURCE_NOT_FOUND`, holding `"Local source not found:"`, is now
  `LOCAL_MARKETPLACE_NOT_FOUND` holding `"Local marketplace not found:"` — matching
  `source-fetcher.ts`'s `` `Local marketplace not found: '${absolutePath}'` ``. Name and value
  moved together, which is the whole point of surface 1 above.
- The two spec names now say "whose stored marketplace is gone" and "pointed at a marketplace
  that does not exist". They read true either way in ordinary English, and were changed because
  the entity they name is `config.marketplace` — written by the spec itself three lines below —
  so leaving them made one file describe one entity with two nouns.
- `MISSING_SOURCE_PATH` was left alone deliberately. It is a path fixture, not a copy pin: the
  product echoes it back verbatim and the spec asserts it is named. A fixture name should spell
  neither half of a live rename — not the withdrawn noun and not the one replacing it, since a
  negative and a positive can each be satisfied by the echoed fixture rather than by the
  product's prose — so `not-a-real-source-path-refusal-frame` is a
  latent hazard — but no negative currently runs over output naming it, and this file's
  assertions are all positive.

Not fixed, deliberately: `LOCAL_SOURCE_NOT_FOUND` in `init-edit-error-guards.e2e.test.ts` and the
`describe("stored source resolution")` heading. Both are named in `partial_note` above.

## Proposed Standard

For `.ai-docs/standards/clean-code-standards.md`, extending the rename procedure that
`2026-08-16-the-marketplace-rename-stopped-at-typed-positions.md` proposes:

> **After a rename, grep the NEW value as well as the old one, and read every identifier, test
> name and assertion message that holds a hit.** The old-value grep finds work still to do; the
> new-value grep finds work half-done. A constant whose value was corrected and whose name was
> not is invisible to both the type checker and the suite, and specifically invisible to the
> old-value grep, because the value is the part that was already fixed. This is the surface that
> survives longest, since nothing can ever make it fail.

For `.ai-docs/standards/e2e/README.md`, beside the existing rule that test names describe
behaviour:

> **A test name, a `describe` heading and an assertion message are part of the rename.** They
> describe behaviour in the product's vocabulary, so a vocabulary change moves them. None of the
> three is executed, so none can be caught later by running anything — they are corrected in the
> same pass or they are not corrected at all.

On scope, this finding is a second instance of the rule that a class check must name the trees it
read — a sweep of one tree settles one tree — arriving from the other direction: there the sweep
read one tree and
reported as if it had read the repository; here the sweep was _instructed_ to read one tree and
the green result was still received as "the rename is verified". The rule should say that a
rename pass scoped to one tree reports its scope in the same sentence as its result, so that
"unit suite green" is never mistaken for "rename complete".
