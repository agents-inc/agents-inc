---
type: missing-standard
severity: medium
affected_files:
  - src/cli/commands/init.tsx
date: 2026-07-20
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: missing-rule
---

## What Was Wrong

The init success report printed a block that claims to describe a directory on disk:

```
Skills copied to:
  <home>/.claude/skills
    web-framework-react/
    Reviewing/                  <-- display title, no such directory
    CLI Reviewing/              <-- display title, no such directory
    Research Methodology/       <-- display title, no such directory
```

`reportSkillsCopied` rendered each entry with `getSkillById(copied.skillId).displayName`,
but `copySkillsToLocalFlattened` names every destination directory after `skill.id`
(`getFlattenedSkillDestPath` in `src/cli/lib/skills/skill-copier.ts`). For skills whose
`displayName` differs from their id — `meta-reviewing-reviewing` → "Reviewing",
`meta-reviewing-cli-reviewing` → "CLI Reviewing", `meta-methodology-research-methodology`
→ "Research Methodology" — the printed tree named directories that do not exist. A user
copying a line out of that block and `cd`-ing into it gets "No such file or directory".

The bug was found by manually running the CLI. No unit or E2E test caught it: the only
automated assertions on this block are `expect(output).not.toContain("Skills copied to:")`
in `e2e/interactive/init-wizard-plugin.e2e.test.ts` and
`e2e/lifecycle/init-plugin-marketplace-fail.e2e.test.ts`. Nothing asserts the block's
contents when it _is_ printed.

This is a distinct failure mode from the existing "NEVER fall back to `path.basename(dir)`
as a skill ID" rule. That rule governs deriving data _from_ paths. This is the inverse:
rendering a human-facing label where a machine-facing path component is required.

## Fix Applied

Changed `reportSkillsCopied` in `src/cli/commands/init.tsx` to print `copied.skillId`
directly, and removed the now-unused `getSkillById` import. Every path through
`copyLocalSkills` → `copySkillsToLocalFlattened` lands at
`localSkillsDir/skill.id` (including the `alreadyInPlace` local-skill branch, which
returns only when `path.resolve(skill.localPath) === path.resolve(destPath)`), so
`copied.skillId` is exactly `path.basename(copied.destPath)` in all cases.

Audited the rest of the report for the same mismatch — none found:

- `reportAgentsCompiled` prints `${agentName}.md`; `writeCompiledAgentsByScope` writes
  `path.join(targetDir, `${name}.md`)` from the same `AgentName`. Correct.
- `installPluginsStep` prints `item.ref`, which is `{skillId}@{marketplace}` — a plugin
  ref, not a filesystem path. Correct.
- `Configuration:` prints `configResult.configPath` verbatim. Correct.

Added a JSDoc note on `reportSkillsCopied` explaining why ids are used, since the
natural instinct is to "improve" this back to `displayName`.

## Proposed Standard

Add to `CLAUDE.md` → "NEVER do this" → "Data Integrity":

- NEVER print a skill/agent `displayName` inside a block that describes the filesystem
  (anything under a "copied to:" / "compiled to:" / path header). Those entries are
  literal directory and file names — use the id (`copied.skillId`) or the basename of
  the recorded `destPath`. A user must be able to copy any line out of such a block and
  `cd` into it. `displayName` is for selection UI and change summaries only (e.g. the
  `+ Reviewing` / `~ Reviewing` lines in `edit.tsx`, which describe choices, not paths).

Coverage gap worth closing (not owned by this task): no test asserts the _contents_ of
the "Skills copied to:" block. An eject-mode E2E that installs a skill whose
`displayName` differs from its id — `meta-reviewing-reviewing` is the cheapest case —
should assert `expect(output).toContain("    meta-reviewing-reviewing/")` and
`expect(output).not.toContain("    Reviewing/")`. That belongs in an eject-mode init
E2E file (e.g. `e2e/interactive/init-wizard-scratch.e2e.test.ts` or a scope-split
sibling), using `STEP_TEXT.SKILLS_COPIED_TO` from `e2e/pages/constants.ts`.
