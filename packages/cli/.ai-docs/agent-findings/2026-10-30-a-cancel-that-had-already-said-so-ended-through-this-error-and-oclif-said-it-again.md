---
type: anti-pattern
severity: low
affected_files:
  - src/cli/commands/edit.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-30
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  `confirmSharedConfigOrCancel` in `commands/edit.tsx` ends a declined apply with
  `this.exit(EXIT_CODES.CANCELLED)` after its "Edit cancelled" line, as `cancelUninstall` in
  `commands/uninstall.tsx` and init's "Setup cancelled" path already did.
---

## What Was Wrong

A declined `edit --from` logged "Edit cancelled" and then called
`this.error("Cancelled", { exit: EXIT_CODES.CANCELLED })`. oclif prints every error except an
`ExitError`, so the terminal showed the cancel twice: "Edit cancelled", then " › Error: Cancelled".
The unit runner never prints errors, so the only spec on it pinned `error.message === "Cancelled"`,
which held the doubled line in place.

## Fix Applied

`this.exit(EXIT_CODES.CANCELLED)` after the command's own line. Census of the cancelled-exit sites
after the fix (`grep -rn 'EXIT_CODES.CANCELLED' src/cli --include='*.ts' --include='*.tsx' | grep -v
__tests__`): `this.exit` in `edit.tsx`, `uninstall.tsx` and `init.tsx` (`--from`, after "Setup
cancelled"); `this.error("Cancelled")` in `init.tsx` (`showDashboardOrOpenEditor`) and
`hooks/init.ts`, each of which prints nothing before it, so each says the cancel once. Left as is.

## Proposed Standard

`clean-code-standards.md` 12.2, beside the `COMPLETED_WITH_FAILURES` sentence: a cancel that has
already printed its own line ends through `this.exit(EXIT_CODES.CANCELLED)`; `this.error` is for a
cancel whose error text is the only thing said. A spec on a cancel pins the error as
`Errors.ExitError` (or the output's last line), not `error.message`, since a unit run never shows
what oclif prints. No gate holds this honestly: a scan for `this.log` before `this.error` cannot
tell a cancel line from any other.
