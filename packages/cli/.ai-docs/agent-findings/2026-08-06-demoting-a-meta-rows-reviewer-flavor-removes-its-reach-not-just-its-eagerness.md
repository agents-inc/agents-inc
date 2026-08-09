---
type: architectural-drift
severity: medium
affected_files:
  - packages/matrix/src/read-model/preload-defaults.ts
  - packages/matrix/src/read-model/assignment-defaults.ts
standards_docs:
  - .ai-docs/reference/features/agent-system.md
date: 2026-08-06
reporting_agent: cli-developer
category: architecture
domain: shared
root_cause: rule-not-specific-enough
status: resolved
resolved_by: CLI-416 took the finding's second option — `metaSkillReach` in assignment-defaults.ts now reads a `REVIEWER_CRAFT_CATEGORIES` list rather than the single reviewing category, so `meta-design` reaches the cross-domain reviewer row-lessly like `meta-reviewing` does. Reach only; eagerness is still the row's answer, and the rows name `developer` alone, so the reviewer's copy is lazy where a developer's is preloaded. The pins recording the absence were re-pinned in assignment-defaults.test.ts and the editor's default-assignments.test.ts, with the row-is-the-whole-reach rule moved onto `meta-methodology-research-methodology`, a meta skill in neither craft.
---

## What Was Wrong

The reviewer-column thinning ruling reads "demote every other `reviewer` entry to lazy". For a
domain skill or a shared skill that is exactly what happens: targeting reaches the reviewer on its
own rule (`implementationDomainReach` adds the cross-domain role agent, `NON_META_ROSTER` includes
it), so dropping `"reviewer"` from the row leaves the skill on the reviewer, lazily.

For a **meta-domain** skill the row is the whole of the reach. `metaSkillReach` in
`assignment-defaults.ts` targets exactly the flavors the row names, with one exception — the
`meta-reviewing` craft category, which reaches the reviewer with or without a row. So dropping
`"reviewer"` from `meta-design-composable-components` and `meta-design-expressive-typescript` did
not demote them to lazy on the reviewer: it removed them from the reviewer's default assignment
altogether. A fresh pick of "expressive typescript" now assigns four developers and no reviewer.

That may well be what the owner wants — the consolidated reviewer's material arrives per diff
through the `meta-reviewing-*` checklists — but it is a different outcome from the one the ruling's
words describe, and the mapping has no way to say "reach the reviewer, lazily" for a meta skill
outside the reviewing craft. The two demoted rows are the only ones in the catalog where this bites
today.

## Fix Applied

The reporting pass changed nothing on the reach model: it applied the ruling as written and pinned
the consequence instead of hiding it, in `assignment-defaults.test.ts` and `apps/editor`'s
`default-assignments.test.ts`.

CLI-416 then widened the craft exception, per the owner's 2026-08-06 ruling that the reviewer gets
LAZY access to the meta-design skills — narrower than the "any meta skill" version proposed below,
because the ruling names the design craft and leaves `meta-methodology` alone. `metaSkillReach`
reads a `REVIEWER_CRAFT_CATEGORIES` list where it read a single `REVIEWING_CRAFT_CATEGORY`
constant, so `meta-design` reaches the cross-domain reviewer row-lessly exactly as `meta-reviewing`
does. The list is `["meta-reviewing", "meta-design"] as const satisfies readonly
CatalogSkill["categoryId"][]`, so a category that stops existing upstream fails the build here
rather than silently reaching nobody, and `isReviewerCraft(skill)` is what `metaSkillReach` asks.

The reach is targeting alone — eagerness is still `createLoadStateResolver`'s answer off the row,
and the two rows name `developer` alone, so the reviewer's copy resolves lazy while every
developer's stays preloaded. The pins that recorded the absence were re-pinned on both surfaces,
and the "a row is the whole of a meta skill's reach" rule moved onto
`meta-methodology-research-methodology` — a meta skill in neither craft, so it still holds there
unqualified.

## Proposed Standard

Say in `agent-system.md`, beside the reviewer consolidation note, that a `PRELOAD_DEFAULTS` row
carries two meanings and which one applies depends on the skill's catalog domain: for
implementation and shared skills a row is EAGERNESS only, for meta skills it is REACH as well.
A ruling phrased as "demote to lazy" therefore needs a decision per tier before it is applied to a
meta row — either the row stays and the load answer is what changes, or the skill leaves the agent.
The alternative is to widen the craft exception in `metaSkillReach` so any meta skill can reach the
reviewer row-lessly and lazily, which would make "demote to lazy" mean one thing everywhere.
