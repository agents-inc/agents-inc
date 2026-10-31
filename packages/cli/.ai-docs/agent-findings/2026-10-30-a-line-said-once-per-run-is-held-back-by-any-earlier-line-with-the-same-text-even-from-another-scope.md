---
type: missing-standard
severity: low
affected_files:
  - src/cli/utils/logger.ts
  - src/cli/lib/operations/skills/discover-skills.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-30
reporting_agent: cli-developer
category: architecture
domain: shared
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The one line that hit it (the count of skill folders skipped for having no metadata.yaml) now
  names HOME's folder from `~/`, so its global and project texts cannot coincide. The logger still
  matches on text alone, and no rule says a line said once per run must be worded apart from every
  line said outside that scope.
---

## What Was Wrong

`warn()` in `src/cli/utils/logger.ts` adds every line it prints to `alreadySaid`, inside
`sayingEachWarningOnce` or not, and `isARepeatToHoldBack` holds back a line said inside the scope
when that set already holds the same text. So a line from a scan outside the scope (a project's)
silences an identical line from the scan inside it (the global one).

A scan of installed skills now says one line per folder for the folders it skipped. Both scopes
name their folder by `skillsPathPrefix`, which is relative to each scope's own root, so both read
`'.claude/skills/'`. A project line "Skipped 2 skills in '.claude/skills/' …" said first would then
hold back a global line with the same count. In a fan-out (`edit --from` at HOME recompiling each
registered project), that drops the global folder's line without a trace. The tester's both-scopes
unit spec showed it: under relative labels it received only the project lines.

The `sayingEachWarningOnce` docblock says specs need unique text. It says nothing of production
lines from two scopes.

## Fix Applied

`folderLabelAt` in `discover-skills.ts` names the global folder `~/<prefix>/`, or in full when it
lies outside HOME. That text is the same from HOME and from every project, which once-per-run
needs, and never equals a project's. Caught by "in both scopes of a project run, are said in one
line per folder, the global one named apart" in
`src/cli/lib/operations/skills/each-global-skill-warning-is-said-once.test.ts`. The logger is
unchanged.

## Proposed Standard

Proposal, not an approved rule (no conflict found in `CLAUDE.md` or `clean-code-standards.md`,
which say nothing of the logger's memory). Either:

- In the `sayingEachWarningOnce` docblock and `clean-code-standards.md`: a line said inside the
  scope names its subject in text no line said outside the scope can share. Or:
- The logger remembers only lines said inside the scope, so a line said outside can never hold one
  back. This changes behaviour for any caller that relies on today's wider memory, so census
  `sayingEachWarningOnce(` and `warnOnce(` callers first.
