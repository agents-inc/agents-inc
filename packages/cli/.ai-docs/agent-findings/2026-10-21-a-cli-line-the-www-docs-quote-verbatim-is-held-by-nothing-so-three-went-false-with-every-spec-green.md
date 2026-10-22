---
type: standard-gap
severity: low
affected_files:
  - apps/www/src/content/docs/docs/reference/commands.md
  - apps/www/src/content/docs/docs/troubleshooting/index.md
  - apps/www/src/content/docs/docs/troubleshooting/common-problems.md
  - apps/www/scripts/check-cli-claims.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

Three verbatim quotes of CLI output in the user docs went false when the CLI's wording changed,
while the specs that pin the new wording were green:

- `No Orphans ✓ No orphaned agent files`, in the `doctor` sample of `reference/commands.md` and of
  `troubleshooting/index.md`. The row now reads `No orphaned skills or agent files`
  (`e2e/commands/doctor-diagnostics.e2e.test.ts` pins it).
- `Sharing this configuration failed (HTTP 429).` in `troubleshooting/common-problems.md`, called
  bare "on purpose". The store always sends `retry-after`, so the CLI now prints
  `… (HTTP 429): rate limit reached — try again in 1 minute.` (`e2e/commands/share.e2e.test.ts`
  pins it).

This is the census for this programme's changes: each changed string was grepped across `docs/`,
the READMEs, both `CLAUDE.md` files and `apps/www/src/content/`. It is not a census of every quoted
line in the docs.

The www gate looks wider than it is. `check-cli-claims.ts` binds the command table and each row's
flags in `reference/commands.md` to `packages/cli/src/cli/commands/**`, and `check-editor-address.ts`
binds editor addresses. No check reads a quoted line of output, so the same page holds a checked
table and unchecked samples. The lines were found because the lane that changed them listed them for
the docs step.

## Fix Applied

The three quotes were corrected in the docs pass. No guard was added.

## Proposed Standard

No cheap gate exists. The samples carry illustrative paths and counts (`/home/me/my-skills`,
`238 skills`), so a checker cannot compare a sample block with a real run without a normalising
step that would itself need tests. Two smaller options, for the owner:

1. In `documentation-bible.md`, state that a docs pass greps the docs for every product string a
   change rewords, and that a lane report names each quoted line it made false. This is what found
   all three here.
2. A www check limited to `doctor` row messages: each `<row> <glyph> <message>` line in a sample
   block must have its message, digits masked, appear as a string in
   `packages/cli/src/cli/commands/doctor.ts`. This catches a reworded pass line like the one above,
   not a reworded template.
