---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/seed/external-skills.ts
  - src/cli/commands/edit.tsx
  - src/cli/commands/init.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: superseded
superseded_by: 2026-10-21-a-carried-skill-id-off-the-wire-was-joined-into-a-path-unchecked-so-a-link-could-write-outside-its-folder.md
---

## What Was Wrong

`edit --from` decides which carried skills it would rewrite before it asks, through
`carriedSkillsThatDiffer`. That function writes each carried skill under
`path.join(scratch, install.id)`. `install.id` is a payload key, and the schema accepts any string,
so an id like `../victim` writes outside the scratch directory while the question is on screen, and
the files stay after a No. `refuseUncarriedDestinations` checks only the real destination. The
install path has the same hole: `externalSkillDir` joins the raw key too, and headless `init --from`
with `../../../escaped-dir` wrote under `$HOME`. Sibling search:
`grep -n 'path.join(' src/cli/lib/seed/external-skills.ts` finds both joins of the raw key
(`externalSkillDir`, `scratchCopyOf`).

The trap is that a preview is assumed to be safe. A dry run that writes, even to scratch, is as
dangerous as the apply wherever a path in it comes from the payload.

## Fix Applied

None in `external-skills.ts`, which belongs to another lane. The exact change, a refusal in
`registerExternalSkills` of any id that is not one directory name (no separator, not `""`, `.` or
`..`, no terminal control), is in the Lane 1 report of 2026-10-21. It runs before anything is
seated, so both commands refuse before any write or question.

## Proposed Standard

`clean-code-standards.md`: an id that becomes a path segment is validated as one segment where it
enters (`registerExternalSkills` for carried skills), not where it is joined. Every write it reaches
then inherits the check, dry runs included.
