---
type: standard-gap
severity: high
affected_files:
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/configuration/config-writer.ts
  - src/cli/types/config.ts
  - src/cli/lib/installation/local-installer.test.ts
standards_docs:
  - .ai-docs/reference/concepts/tombstone-pattern.md
  - .ai-docs/reference/concepts/scope-system.md
date: 2026-07-29
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: missing-rule
status: superseded
superseded_by: 2026-07-30-d277-global-immutability-collapses-tombstone-provenance.md
partial_note: >-
  Code-side fix HAS shipped: the narrow self-heal recommended here shipped as
  `dropOrphanedDerivedMasks` in local-installer.ts, scoped to categories the merged matrix declares
  BOTH `exclusive` AND `required`, with the trade-off documented in the function's doc comment.
  Still pending at the time: the proposed "Derived masks vs. authored tombstones" section in
  tombstone-pattern.md and the empty-categories-fixture rule in mock-data.md / e2e test-data.md.
resolved_by: >-
  SUPERSEDED by D-277. The constraint this finding rests on — that a derived mask and a
  user-authored tombstone are indistinguishable — no longer binds, because the wizard can no longer
  author a BARE tombstone: a project-scope deselect of a globally-installed item is refused, and
  neither `applySkillRemoval` nor `applyAgentToggle` stamps `excluded` any more. The one remaining
  user route (`s`, G→P) always pairs the tombstone with an active project entry, i.e. an identity
  collision. So a bare mask is provably machine-derived, the `exclusive && required` narrowing and
  its TRADE-OFF paragraph are deleted, and the self-heal keys on a single test: does the collision
  that would re-derive the mask still hold. The provenance discussion the finding asked for now
  lives in tombstone-pattern.md (Overview + "Creation outside the wizard").
---

## What Was Wrong

Writing the RED tests for cross-scope category exclusivity surfaced a constraint on the fix that is
not visible from the bug report alone: **a mask derived by reconciliation and a tombstone authored by
the user are byte-identical in `config.ts`.**

Both are `{ id, scope: "global", excluded: true }` in the project config:

| Origin                                                                             | Shape written                                |
| ---------------------------------------------------------------------------------- | -------------------------------------------- |
| User deselects a globally-installed skill from project scope (`applySkillRemoval`) | `{ id: X, scope: "global", excluded: true }` |
| Reconciliation masks a global skill that collides with a project-owned one         | `{ id: X, scope: "global", excluded: true }` |

This matters because the two require **opposite** treatment on the next write:

- The user-authored tombstone must be **preserved** for as long as the global install exists.
  `retainReconciledSkills` already does this, and `propagateGlobalChangesToProjects >
"preserves a skill tombstone when the global skill still exists"` pins it.
- A derived mask must **not outlive the collision that produced it**. Once the project no longer owns
  a skill in that exclusive category, the masked global skill has to become active again — otherwise
  a project that removes its own framework skill is left with no framework at all, permanently.

With no marker in the persisted shape, a rule of the form "reactivate an orphan global tombstone in an
exclusive category" resurrects a skill the user deliberately deselected.

The only reason the two rules do not collide in the current test suite is an accident of fixture data:
`SINGLE_REACT_MATRIX` (used by the preservation test) has an EMPTY `categories` map, so
`web-framework` reads as "no exclusivity flags" and any exclusivity-keyed rule is inert there. A fix
that keys on `matrix.categories[category]?.exclusive === true` therefore keeps the existing test green
by luck of fixture shape, not by design. A future fixture that supplies real category definitions to
that test would flip it red.

## Fix Applied

The narrower rule this finding recommends is now implemented as `dropOrphanedDerivedMasks` in
`local-installer.ts`: a global tombstone is dropped only when its category is declared BOTH
`exclusive` and `required` by the merged matrix AND the project owns no active project-scoped
skill in that category. Both invariants hold as predicted — the self-heal test passes, and
`preserves a skill tombstone when the global skill still exists` stays green because
`SINGLE_REACT_MATRIX` supplies no category flags, exactly the fixture accident described above.

The two rules are distinguished by CATEGORY CLASS, not by a marker on the shape: in a category that
is both exclusive and required, the wizard's own only-skill guard (`toggleTechnology`) refuses to
empty the category, so a lone tombstone there can only be machine-derived. In an OPTIONAL exclusive
category the mask persists after the collision clears and the user re-selects manually — the deliberate
price of never resurrecting a knowingly-deselected skill. Both the rule and the trade-off are
documented in the function's doc comment.

The original RED tests, all now green:

- `local-installer.test.ts > cross-scope category exclusivity > propagateGlobalChangesToProjects >
"reactivates the masked global skill once the project owns nothing in that exclusive category"` —
  pins the self-heal requirement.
- `... > "leaves a project-owned skill unmasked when the colliding global skill is in a non-exclusive
category"` — pins that the rule is exclusivity-scoped, so non-exclusive categories are untouched.

The self-heal test deliberately uses a matrix whose exclusive category is ALSO `required: true`, so a
narrower fix ("only self-heal in exclusive **and required** categories, where an empty category is
itself invalid") satisfies it too. That narrower rule is the one that does not collide with the
user-deselect semantics for optional exclusive categories.

## Proposed Standard

Add to `.ai-docs/reference/concepts/tombstone-pattern.md`, as a new "Derived masks vs. authored
tombstones" section, and cross-link from `.ai-docs/reference/concepts/scope-system.md`:

> A tombstone records an INTENT ("this project does not want the global install of X"). A mask records
> a DERIVED CONSEQUENCE ("this project cannot show the global install of X, because it owns a
> conflicting skill in the same exclusive category"). They are currently written with the same shape,
> so any reconciliation rule that treats one as the other is wrong in the case it did not consider.
>
> When adding a reconciliation rule that CREATES an `excluded: true` entry, state explicitly:
>
> 1. What condition creates it.
> 2. What condition removes it — and how that condition is distinguished from the user-authored
>    tombstone whose removal condition is only "the global install disappeared".
>
> If the two cannot be distinguished from the persisted shape, the rule must either be narrowed until
> they can (e.g. scoped to `exclusive && required` categories, where an empty category is invalid
> regardless of intent) or the shape must gain a marker. Do not ship a rule that silently resurrects a
> deliberately-deselected skill.

Also add to `.ai-docs/standards/e2e/test-data.md` (or `.ai-docs/reference/testing/mock-data.md`):

> A matrix fixture with an empty `categories` map makes every category read as "flags undefined".
> Tests that assert on category-flag-driven behaviour (`exclusive`, `required`) must use a fixture that
> supplies real category definitions — `CATEGORY_EXCLUSIVITY_MATRIX` in
> `src/cli/lib/__tests__/mock-data/mock-matrices.ts`. Conversely, a test that must stay inert under a
> category rule should say so explicitly rather than relying on `createMockMatrix`'s empty default.
