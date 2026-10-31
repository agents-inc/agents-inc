---
type: missing-standard
severity: low
affected_files:
  - src/cli/lib/loading/source-loader.ts
  - src/cli/lib/loading/source-loader.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-30
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: missing-rule
status: open
---

## What Was Wrong

`undeclaredCategoryRefusal` in `src/cli/lib/loading/source-loader.ts` built the file it tells the
user to edit from `metadata.path`, which `extractLocalSkill` in
`src/cli/lib/skills/local-skill-loader.ts` writes relative to the skill's own scope root. A home
skill read from a project therefore printed `Set category in .claude/skills/<dir>/metadata.yaml`,
a path that resolves under the project, where no such file exists. The sibling warnings in
`local-skill-loader.ts` already print the absolute `metadataPath`. The unit specs pinned the relative
path, so they held the defect in place.

Sibling search, `grep -rn -E 'path\.join\([a-zA-Z]+\.path,|skill\.path\b|metadata\.path\b' src/cli`
(production files only): two message sites. The other is the duplicate-id warning in
`src/cli/lib/matrix/skill-resolution.ts`, fed only from a marketplace folder, never from the home
folder's skills.

## Fix Applied

None in product code: the tests come first. `source-loader.test.ts` now expects the absolute path for
a home skill and a project skill read off disk by a project's load, and its synthetic pins moved to
the absolute path.

## Proposed Standard

`clean-code-standards.md` §12, new 12.4: a message that sends the user to a file names it by its
absolute path (a skill's `localPath`, never its scope-root-relative `path`), because the file can
sit under the home folder while the command runs in a project. Checked against both `CLAUDE.md`
files: no conflict.
