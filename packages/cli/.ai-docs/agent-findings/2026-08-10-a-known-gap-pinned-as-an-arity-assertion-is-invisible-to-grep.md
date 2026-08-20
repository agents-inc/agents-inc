---
type: standard-gap
severity: low
affected_files:
  - src/cli/lib/__tests__/integration/compilation-pipeline.test.ts
  - src/cli/lib/marketplace-generator.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
  - CLAUDE.md
date: 2026-08-10
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The code-side pins landed with the category change. The Proposed Standard below is now written
  into CLAUDE.md's Test Assertions list, beside the `// KNOWN GAP:` rule it complements, together
  with its corollary about where the pin belongs. Pending: the separate rule that `metadata.yaml` is
  a generator input rather than a shipped artefact, which this finding records as outstanding and
  which `clean-code-standards.md` still does not carry.
---

## What Was Wrong

CLI-481 threaded a skill's `category` from `metadata.yaml` through `plugin.json` to the marketplace
entry. The task brief named one test pin to update — `compilation-pipeline.test.ts`'s
all-uncategorized expectation — and a `grep -rn uncategorized` over `src/` and `e2e/` agreed with
it, returning that one spec line plus its comment. There were three, and grep could only ever find
one of them.

| Pin                                                                              | Says                                 | Findable by grepping the lost field? |
| -------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------ |
| `expect(stats.byCategory["uncategorized"]).toBe(marketplace.plugins.length)`     | every plugin is uncategorized        | yes — names the bucket               |
| `expect(Object.keys(stats.byCategory)).toHaveLength(1)`                          | the same thing, as an arity fact     | no                                   |
| `it("should generate plugin without category (category comes from metadata...")` | the manifest cannot carry a category | no — its subject is the absence      |

The second is the shape worth naming. `byCategory` grouped by `p.category ?? "uncategorized"`, so
"exactly one key" was true only because the field never arrived — but as written it reads as a
legitimate invariant about a fixture whose skills happen to share a category. It sits in a test
called "should generate marketplace with correct plugin count", which is about neither categories
nor gaps. Nothing on that line mentions the field it silently depends on, so it survives every
search for the gap and reddens only when the fix lands — at which point it reads as a regression the
change caused rather than a pin the change was supposed to retire.

The third is the same failure in a test NAME: an assertion whose subject is a field's absence, whose
parenthetical explains that the absence is correct-by-design. It is only findable by someone already
reading that file.

CLAUDE.md's Test Assertions rules cover the inverse case — a test that FAILS because of a known gap
must carry `// KNOWN GAP:` or `it.fails`, and must never be broadened to pass. Nothing covers a test
that PASSES because of the gap, which is the more common shape: a data-loss bug is usually
consistent, so the assertion recording it looks like any other green invariant.

The `it.fails("carries a category on every plugin entry")` in
`e2e/commands/plugin-build-versioning.e2e.test.ts` is the counter-example that worked exactly as
intended: it named the missing field, carried a docblock explaining the chain that drops it, and
flipped green on the first run after the fix.

## Fix Applied

All three pins updated to the new truth as part of CLI-481, not deleted:

- the arity pin and the all-uncategorized pin both became
  `expect(stats.byCategory).toStrictEqual(EXPECTED_CATEGORY_COUNTS)` against a named constant that
  writes out the fixture's four categories in full, so a category that stops arriving fails the
  comparison rather than shrinking the expectation;
- the marketplace-generator test split into a positive case (a manifest carrying `category` puts it
  on the entry) and the no-category case, which is now about a manifest authored without one rather
  than about a pipeline that cannot produce one.

Two findings in this directory recorded this defect from either end and were overtaken by the same
change; both have since been deleted rather than re-statused. What did not go with them is the
standards half neither ever got written down. The diagnoses are spent — the code-side fix shipped,
so "neither carries `category` through" and "the field is for third-party marketplace authors, not
for this repo's output" are both false today, and `plugin-system.md` correctly states the opposite.
What remains outstanding is that `clean-code-standards.md` carries neither of the two standards the
first proposed, and that the rule `metadata.yaml` is a generator input rather than a shipped
artefact is still unaddressed.

## Proposed Standard

For CLAUDE.md's **Test Assertions** section, beside the existing `// KNOWN GAP:` rule, which covers
only the failing direction:

**An assertion that is true only because of a known defect must name the defect in the assertion
itself — never in its arity, its length, or its absence.** `toHaveLength(1)` over a grouped map,
`toBeUndefined()` on a field another layer is meant to populate, and a test named for what does not
happen all encode a bug as an invariant that no search for the bug can find. Write the group name
(`byCategory["uncategorized"]`), or a full `toStrictEqual` against a named constant, so the pin
answers a grep for the field it is about.

The corollary, for the same section: **the pin's home is the test whose subject is the gap.** The
arity pin rode along in a plugin-count test, where a reader retiring the gap has no reason to look.
