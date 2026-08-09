---
type: architectural-drift
severity: medium
affected_files:
  - apps/editor/src/features/configure/lib/default-assignments.ts
  - apps/editor/src/stores/config-store.ts
  - apps/editor/src/stores/added-skills-store.ts
standards_docs:
  - docs/web/editor-spec.md
date: 2026-08-06
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: scope-discipline-deferred
status: resolved
resolved_by: EDITOR-14 replaced `defaultAssignmentsFor`'s domain-filtered targeting with the CLI's broadcast, which needs no category to target with — so an added skill reaches every non-meta agent again, lazily, and the question the finding raised is answered by the rule rather than by a second data source. See Resolution Note below.
---

## What Was Wrong

`defaultAssignmentsFor` used to take a category id, and `freshEntry` in
`config-store.ts` fed it `categoryIdOf(skillId)` — a two-source lookup: the
catalog for its own skills, and `useAddedSkillsStore` for a skill added from
GitHub this session. An added skill whose repo name matched a catalog slug
(`categoriseRepo`) therefore got real assignments: its matched category placed
it in a domain, and every core agent of that domain lit up.

CLI-390 re-plumbs the function to take a skill id and derive the category from
`CATALOG.skillsById`, because the shared preload mapping is keyed by catalog
skill id and cannot answer for anything else. That leaves `categoryIdOf` with
no caller, and the added-skills half of it disappears with it: an added skill
now assigns nowhere.

Two things are tangled here, and only one of them is settled:

- **The load half is settled.** The mapping has no entry an added skill could
  ever match, so lazy is the only honest answer — a rule, not a fallback.
- **The targeting half is a silent behavioural change.** Nothing in the editor's
  test suite covered it (`derive.test.ts` builds an `AddedSkill` with
  `categoryId: null`, the uncategorised shape, so the matched-category path has
  never been exercised), so the change went in green.

Worth noting that the lookup it removes is itself the shape the CLI's CLAUDE.md
bans: `categoriseRepo` matches a repo name against catalog slugs, then retries
with punctuation stripped — a multi-tier resolution fallback. So the removal is
defensible on its own terms; what is missing is a decision, not a fix.

## Fix Applied

None at the time of writing — behaviour recorded, not restored. CLI-390's brief
states that targeting is out of scope and EDITOR-14 owns it, so this was written
down rather than patched. The test `assigns nothing for a skill the catalog does
not know` in `default-assignments.test.ts` pinned the then-current answer for
both an unknown id and a `github:` one, so the behaviour was at least asserted
rather than implied.

## Resolution Note

EDITOR-14 landed the owner's 2026-08-06 ruling: `defaultAssignmentsFor` now
broadcasts to every non-meta agent on the roster, the way the CLI's
`buildAgentStack` does, instead of filtering to the category's domain. Targeting
therefore no longer consults the category at all, and the two-source lookup this
finding was about has nothing left to answer — an added skill reaches every
non-meta agent because _every_ skill does.

The load half stayed exactly as this finding described it: the shared mapping is
keyed by catalog skill id and holds no entry an added id could match, so lazy is
the rule for one rather than a fallback. It is now stated as such in
`default-assignments.ts` (`loadFor`), which answers "lazy" directly instead of
asking `resolveLoadState`, whose job is to throw on an id it cannot place.

Of the two options this finding put to EDITOR-14, neither was taken verbatim:
the outcome is the second one's _effect_ (an added skill is assigned, always
lazily) reached by the first one's _means_ (no category is passed, and none is
looked up). `AddedSkill.categoryId` keeps its grid-placement role — `derive.ts`
groups added cells by it — and has no targeting role to delete, because nothing
targets by category any more.

Pinned by `broadcasts an added skill lazily, having no mapping entry to read` and
`treats an id the catalog never had like an added one` in
`default-assignments.test.ts`. The replaced assertion, `assigns nothing for a
skill the catalog does not know`, is gone with the behaviour it described.

`docs/web/editor-spec.md`'s auto-assignment section is still to be updated —
that is EDITOR-14's close-out, not this finding's.

## Proposed Standard

EDITOR-14 should decide explicitly, and `docs/web/editor-spec.md` should state
the outcome in the auto-assignment section: **either** an added skill reaches no
agent until the user assigns it by hand (current behaviour — then say so, and
delete `AddedSkill.categoryId`'s targeting role rather than leaving a field that
looks load-bearing), **or** an added skill is targeted by its matched category
and always loaded lazily (then `defaultAssignmentsFor` needs the category as a
second, explicitly-named argument, and the added-skills store — not the pure
lib — must supply it).

More generally: when a function's input is narrowed from a derived value
(category) to its source (skill id), grep every branch of the old derivation
first. A `??` in the removed helper is a second data source, and dropping it is
a product decision wearing a refactor's clothes.
