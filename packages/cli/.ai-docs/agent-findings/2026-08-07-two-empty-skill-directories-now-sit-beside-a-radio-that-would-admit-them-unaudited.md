---
type: architectural-drift
severity: medium
affected_files:
  - packages/cli/scripts/generate-source-types.ts
  - packages/cli/src/cli/lib/configuration/default-categories.ts
standards_docs:
  - .ai-docs/reference/features/configuration.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  CLI-364 residuals pass (2026-08-07) — both husk directories were deleted from the skills
  repository after verifying each held no metadata.yaml (only an empty examples/ subtree), so
  nothing can silently join the exclusive api-search radio. The generator's skip warnings are gone:
  a full `update-marketplace` run now reports 237 plugins with zero skip warnings, and the CLI's
  validateSource against the checkout reports 0 errors / 0 warnings. The same pass added a metadata
  schema check to the skills repo CI (scripts/validate-metadata.mjs + a workflow step), which fails
  at source on any skill directory whose metadata.yaml is absent or missing required fields — a
  husk can no longer sit in the tree unnoticed, completed or not.
---

## What Was Wrong

`/home/vince/dev/skills/src/skills/` holds two directories that are not catalog members and never
have been:

```
api-search-getxapi/examples/
api-search-xquik/examples/
```

Each has an `examples/` subtree and neither has a `metadata.yaml` or a `SKILL.md`, so
`extractSkills` skips them with a warning on every generation round:

```
⚠ Skipping api-search-getxapi: missing metadata.yaml or SKILL.md
⚠ Skipping api-search-xquik: missing metadata.yaml or SKILL.md
```

A warning on a generator that writes 237 skills is not a gate. B7's F1 flagged the shape and this
pass makes it live: `api-search` is now `exclusive: true`, a pick-one radio whose whole membership
is Elasticsearch and Meilisearch. **Whoever completes either husk — one `metadata.yaml` with
`category: api-search` — silently adds a third member to a radio that was ruled correct on the
grounds that the group is exactly the category (2/2), and does so without an audit verdict, a
`skillAudit` entry, or any batch having looked at whether the fence is right for three.** The
`skillAudit` manifest is `Record<SkillId, SkillAuditEntry>` and would catch the missing verdict at
compile time — but only after the id is already in the union and the radio already holds it.

The same hazard exists for every exclusive category; `api-search` is where two half-finished
directories happen to be sitting.

## Fix Applied

None — discovery only, and deliberately so: deleting directories in the skills repository is a
content decision that repo's owner makes, and this pass's scope was the taxonomy. The flip landed
as ruled; the husks are unchanged.

## Proposed Standard

Two candidates, in order of cost.

1. **Make the skip loud where it matters.** `extractSkills` already knows the directory name. A
   directory that is skipped for missing metadata but whose name prefixes an _exclusive_ category
   deserves more than `console.warn` — it is a queued, unaudited member of a radio. Even a distinct
   message ("`api-search-getxapi` would join the exclusive `api-search` when completed — no audit
   verdict exists") turns a scrolled-past line into something a reader acts on.

2. **State the rule in `.ai-docs/reference/features/configuration.md` → the category section:**
   _flipping a category to `exclusive: true` is a claim about its whole membership, so the flip must
   check for incomplete directories under the same id prefix as well as the members the matrix
   already knows._ The three flips in this pass were each verified as "group == whole category,
   nothing queued to join" — the check was run by hand, and it is the check that has no home.

The cheap immediate action, if the skills repo agrees: delete both directories. They carry
`examples/` and nothing that names them, so nothing regresses.
