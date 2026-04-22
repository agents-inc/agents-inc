---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/agent-findings/2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack.md
  - .ai-docs/agent-findings/2026-04-20-new-agent-toggle-defaults-global-scope.md
standards_docs:
  - .ai-docs/agent-findings/README.md
date: 2026-04-21
reporting_agent: cli-developer
category: architecture
domain: shared
root_cause: enforcement-gap
status: resolved
resolved_by: "Added reciprocal `supersedes:` line to the superseding finding file; lineage is now symmetric."
---

## What Was Wrong

Ralph iter 85 audit of `.ai-docs/agent-findings/*.md` for `supersedes:` / `superseded_by:` frontmatter symmetry found one broken pair.

The older/narrower finding `2026-04-20-new-agent-toggle-defaults-global-scope.md` carried `superseded_by: 2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack.md`, but the authoritative superseding file had no reciprocal `supersedes:` entry.

`.ai-docs/agent-findings/README.md` ("Resolution Model") is explicit: both sides of a supersession must cross-link. A one-way link is an invariant violation — scripts and humans scanning from the authoritative side cannot discover the predecessor.

## Fix Applied

Added `supersedes: 2026-04-20-new-agent-toggle-defaults-global-scope.md` to the frontmatter of `2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack.md`, placed after `root_cause:` to mirror the placement convention used on the reciprocal file.

No other pairs exist in the findings directory (only one `superseded_by:` occurrence total), so no further edits needed.

## Proposed Standard

The README rule is already clear; the gap is enforcement. Propose: add an audit script (or extend the existing iter45 frontmatter-drift tooling) that walks every finding and asserts, for each `supersedes: X`, file `X` exists and contains `superseded_by: <current-file>`, and symmetrically for `superseded_by:`. Run this as part of the Ralph cadence (or as a pre-commit hook on `.ai-docs/agent-findings/`) so one-way links cannot be committed.
