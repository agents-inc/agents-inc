---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/commands/init.tsx
  - packages/cli/src/cli/commands/edit.tsx
  - packages/cli/src/cli/lib/operations/skills/copy-local-skills.ts
  - packages/cli/src/cli/lib/skills/skill-copier.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-31
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  The refused-save lines in init --from now count carried skills apart from copies
  (`skillsRemoved` in init.tsx takes the carried folders out of the copy result). The success-path
  counts still include them, which is an owner question, not a defect to fix here: init's
  `skillsCopiedLine` ("Copied 2 skills to ...") and edit's `localSkillsCopied(copyResult.totalCopied)`.
---

## What Was Wrong

`init --from` writes a skill the configuration carries before it copies, then seats it with a
`localPath` equal to its destination. `copySelectedSkill` in `skill-copier.ts` therefore records it
in place (`resolveLocalCopiedSkill`, `local: true`) and `copyLocalSkills` returns it among
`projectCopied` / `globalCopied` and in `totalCopied`. Nothing on `SkillCopyResult` says so, and its
field names say "copied". So the refused-save line built from the copy result, "Removed the N skills
it copied", counted carried skills too: a run with one copied and one carried skill said "Removed
the 2 skills it copied", and a run with only a carried skill said "Removed the 1 skill it copied".
The owner card that asked about a carried-skills line was written on the opposite premise ("the
line counts copied skills only").

Census of readers of the copy result's counts, 2026-10-31, from `packages/cli`:

```
grep -rn -E "totalCopied|projectCopied|globalCopied" src | grep -v -E "__tests__|\.test\."
```

Outside `copy-local-skills.ts` itself: `init.tsx` (`skillsCopiedLine`, the copied-skills block,
the success summary, and the refused-save count) and `edit.tsx` (`localSkillsCopied`).

## Fix Applied

The refused-save path carries the carried skills' folders (`Selection.carriedSkillDirs`, then
`PutDown.carriedSkillDirs`) and `skillsRemoved` counts copies without them, so the copied line and
the new carried line (`carriedSkillsRemovedAfterRefusedSave` in `utils/messages.ts`) never count one
folder twice. Pinned by the two "says, after the error, that it removed the skill ..." specs in
`src/cli/lib/__tests__/commands/init-from-says-what-it-did.test.ts`.

## Proposed Standard

A count of copies read off `SkillCopyResult` includes skills recorded in place; a line that means
"from the marketplace" filters them first. Either the type says so in a docblock on
`SkillCopyResult`, or in-place records move to their own field. Proposal only; not checked
against `clean-code-standards.md` beyond finding no rule on it.
