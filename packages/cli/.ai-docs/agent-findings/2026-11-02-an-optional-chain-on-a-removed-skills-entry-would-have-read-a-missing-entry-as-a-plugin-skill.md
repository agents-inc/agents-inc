---
type: anti-pattern
severity: low
affected_files:
  - src/cli/commands/edit.tsx
standards_docs:
  - CLAUDE.md
date: 2026-11-02
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  REPO-55's second round, commands lane, replaced both lookups with the asserting
  `installedEntryOf` already in edit.tsx. "Fix Applied" gives the class sweep and its limit.
---

## What Was Wrong

Two lookups in `edit.tsx` read a removed skill's old config entry with `?.`, which is data that
must exist:

- `applyPluginChanges` treated a removed skill as a plugin removal when
  `activeOldSkills.find((s) => s.id === id)?.origin !== EJECT_SOURCE`.
- `removeDeletedLocalSkills` skipped one when `oldSkill?.origin !== EJECT_SOURCE`.

A missing entry reads as `undefined`, which is not `EJECT_SOURCE`, so it would have been handled as
a plugin skill. It would have gone to the plugin removal and never to the local delete, and nothing
would have been said. CLAUDE.md bans `?.` on data that must exist. The file already had
`installedEntryOf`, which throws on a miss.

The miss cannot happen today. `applyApprovedChanges` runs `logChangeSummary` first, and its
`removedSkillLine` sends every removed id to `installedEntryOf` against the same entries.

## Fix Applied

Both lookups call `installedEntryOf`. Behaviour cannot change, because of the ordering above.

Class census, 2026-11-02, from `packages/cli`, for the inline shape:

```
grep -rnE '\.find\([^;]*\)\?\.' src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

Two hits; the same grep at HEAD found three. Both remaining lookups are for data that may be absent,
and both fall back to a named default: `installedScope` in `edit.tsx` (`UNRECORDED_AGENT_SCOPE`)
and a plugin's scope in `uninstall.tsx` (`SCOPE_OF_AN_UNRECORDED_SKILL`). The two-statement shape
(`const x = list.find(…)`, then `x?.field`) has no one-line grep, so this census is a floor. One
was seen in passing, in `operations/skills/uninstall-plugin-skills.ts`, which falls back to its own
`SCOPE_OF_AN_UNRECORDED_SKILL`. It was not judged.

## Proposed Standard

None new: the CLAUDE.md rule covers it. No honest gate exists, because whether data must exist is
not visible in the syntax. A lint rule on `.find(…)?.` would flag the two named-default lookups
above as well.
