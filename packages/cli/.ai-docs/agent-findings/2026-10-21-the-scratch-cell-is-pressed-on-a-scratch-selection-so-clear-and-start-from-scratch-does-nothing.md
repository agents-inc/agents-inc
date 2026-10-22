---
type: audit
severity: medium
affected_files:
  - apps/editor/src/features/configure/components/stack-grid.tsx
standards_docs:
  - apps/www/src/content/docs/docs/editor/index.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: scope-discipline-deferred
status: open
---

## What Was Wrong

With no stack applied and at least one skill selected, the first stack cell reads **Clear and
start from scratch** — "removes N skills and every sub-agent" — and is drawn pressed. Pressing it
does nothing. `isApplied` in `stack-grid.tsx` answers `!onASave && request.stackId === stackId`,
which is `null === null` for the scratch cell, and `choose` returns early on an applied cell. So
the cell whose words promise a clear cannot clear: the only way out of a scratch selection is to
apply a stack first, then press the cell.

Found while writing an e2e for a link the CLI minted that is no stack: it opens on Start from
scratch holding its skills (EDITOR-97's ruling), which makes this state the landing state of every
such link. Reproduce: open the editor, toggle React, press **Clear and start from scratch** — no
confirm opens and React stays selected.

## Fix Applied

None — discovery only. Outside the lane's brief (R1, F8a, F9, Q8).

## Proposed Standard

None needed; a product decision: whether the cleared-words cell counts as "applied" at all. The
likely fix is that the scratch cell is applied only while nothing is selected, so the press reaches
`requestStack` (and its confirm) once there is something to lose.
