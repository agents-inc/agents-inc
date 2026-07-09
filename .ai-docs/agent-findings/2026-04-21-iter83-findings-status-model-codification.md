---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/agent-findings/README.md
standards_docs:
  - .ai-docs/agent-findings/README.md
date: 2026-04-21
reporting_agent: orchestrator
category: architecture
domain: infra
root_cause: convention-undocumented
status: resolved
resolved_by: README Stage 3 + Finding Format sections rewritten to codify frontmatter-as-status; done/ demoted to optional cold archive; cross-link preservation note added
---

## What Was Wrong

`.ai-docs/agent-findings/README.md` described two conflicting resolution models:

1. **Directory-is-status** (Stage 3, Finding Format closing line): "Move processed findings to `done/`. The directory location IS the status."
2. **Frontmatter-is-status** (Optional Lifecycle Fields): `status: resolved` + `resolved_by:` as an in-place marker.

The iter 82 audit found 45 resolved findings in the flat directory using `status: resolved`, and 0 findings in `done/` (the directory didn't even exist). The frontmatter model won by adoption; the directory model never took off.

The drift created three real problems:

- Moving files would break `supersedes:` / `superseded_by:` cross-links, commit-message references, and standards-doc links — all of which use bare filenames.
- Convention-keeper instructions pointed at two mutually exclusive filter rules ("exclude `done/`" vs "filter by `status:`").
- New findings had no unambiguous guide for how to mark themselves resolved.

## Fix Applied

Surgical edits to `.ai-docs/agent-findings/README.md`:

- Stage 3 step 1 changed: "filter open vs resolved by frontmatter `status:`, NOT by directory".
- Stage 3 step 6 changed: "Mark processed findings resolved in place (`status: resolved` + `resolved_by:`) — do NOT move files".
- Removed "The directory location IS the status." from Finding Format.
- Added new "Resolution Model (authoritative)" subsection codifying: frontmatter is authoritative, never move files, `done/` is an optional cold archive for >6-month-old findings (not required), consumers must filter by frontmatter.
- Clarified the `status: resolved` + `resolved_by:` entry in Optional Lifecycle Fields: always paired, authoritative resolution marker, applies to standards updates too (not just anti-pattern fixes).

Filed this finding (iter 83) to document the decision.

## Proposed Standard

Codified in `.ai-docs/agent-findings/README.md` § Resolution Model (authoritative):

- Resolution = frontmatter edit (`status: resolved` + `resolved_by:`). Never a file move.
- `done/` is optional cold archive for very old resolved findings (>6 months). Not a required workflow.
- All tooling / agents / humans must filter open vs resolved by `status:`, not path.

Next convention-keeper pass should verify no remaining docs tell agents to "move to `done/`" — grep `.ai-docs/` for that phrase and update any stale references.
