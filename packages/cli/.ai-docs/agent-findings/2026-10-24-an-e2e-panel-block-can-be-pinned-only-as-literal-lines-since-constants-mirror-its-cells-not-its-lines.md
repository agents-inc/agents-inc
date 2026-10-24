---
type: missing-standard
severity: low
affected_files:
  - packages/cli/e2e/commands/uninstall-names-skills-the-built-in-catalogue-lacks.e2e.test.ts
  - packages/cli/e2e/interactive/uninstall-names-a-kept-global-copy-at-a-terminal.e2e.test.ts
  - packages/cli/e2e/interactive/init-from-prints-its-panel-whole.e2e.test.ts
  - packages/cli/e2e/interactive/list-keeps-long-names-whole.e2e.test.ts
  - packages/cli/e2e/pages/constants.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-10-24
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`packages/cli/CLAUDE.md` says a `toContain` pinning a block ends on the line after the block. In
the summary panel, every line carries both columns, and two skills can share one line. The e2e
vocabulary for the panel is `panelRow(marker, name)` and the `PANEL_*` members of `STEP_TEXT` in
`e2e/pages/constants.ts`. All of them pin one cell, and a cell has no "line after" to append. Panel
lines are not mirrored anywhere, and `e2e/README.md` forbids text constants local to a spec. So a
spec pinning a block of panel rows has no compliant way to write it.

Two specs already work around this by pinning a whole frame as an inline-snapshot literal:
`interactive/init-from-prints-its-panel-whole` and `interactive/list-keeps-long-names-whole`.
`grep -rln '│' e2e --include='*.ts'` (a census) also lists `pages/constants.ts`, the two CLI-954
specs, and `commands/search-static` (that hit is only a comment). No standard describes the
practice.

`uninstall` cannot use a whole-frame snapshot, because it prints the absolute temp paths of the
files it deletes under its panel. At a PTY, that path line wraps at a point set by the temp
directory's length, so a block that ends on it passes or fails depending on the machine.

## Fix Applied

None to existing specs. The two CLI-954 specs write the expected block as literal lines inside the
assertion. The lines are measured from a real run at the width the spec runs at: 80 columns over a
pipe, `TERMINAL_SIZE.MIDDLE` at a PTY. The one row under test is the exception. The piped block
ends on the `- <dir>/config.ts` line under the panel. The PTY block ends on the bottom border,
which is the line after the rows.

## Proposed Standard

Add to `e2e/README.md` (or `assertions.md` § Negative Assertions), under "Pinning a panel":

- A block of panel rows is pinned as literal lines in the assertion, measured from a run at a fixed
  width: 80 when piped, or a `TERMINAL_SIZE` member at a PTY.
- The block ends on the line after its rows.
- At a PTY, a block never ends on a line that holds a temp path.

This conflicts with "NEVER define path/timeout/text constants locally in E2E test files"
(`packages/cli/CLAUDE.md`, `e2e/README.md`). The standard would have to say that an expected frame
is not shared vocabulary, the same way an inline snapshot is not.
