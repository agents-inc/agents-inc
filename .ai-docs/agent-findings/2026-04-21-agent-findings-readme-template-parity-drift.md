---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/agent-findings/README.md
  - .ai-docs/agent-findings/TEMPLATE.md
standards_docs:
  - .ai-docs/agent-findings/README.md
  - .ai-docs/agent-findings/TEMPLATE.md
date: 2026-04-21
reporting_agent: orchestrator
category: architecture
domain: infra
root_cause: convention-undocumented
status: resolved
resolved_by: Added `blocked_by` to TEMPLATE optional lifecycle fields; added explicit `severity` enum (high | medium | low) to README field list.
---

## What Was Wrong

Parity audit of the finding meta-docs (`README.md` ↔ `TEMPLATE.md`) uncovered two-way drift:

- **TEMPLATE missing `blocked_by`** — README documents `blocked_by: <filename>` under "Optional Lifecycle Fields" (cross-link to upstream open/partial finding whose code-side fix must land first), but TEMPLATE's optional-lifecycle block lists only `status`, `partial_note`, `resolved_by`, `supersedes`, `superseded_by`. Authors copying TEMPLATE would never see `blocked_by` as an option.
- **README missing `severity` enum** — TEMPLATE declares `severity: high | medium | low`, but README's field inventory just names `severity` without the enum, making it look like a freeform string.

All other fields and enums (`type`, `category`, `domain`, `root_cause`, `status`) are in sync.

## Fix Applied

- TEMPLATE: added `# blocked_by: <upstream-finding-filename.md>` comment line alongside `supersedes` / `superseded_by` in the optional-lifecycle block, with a one-line purpose note matching README.
- README: added `(high, medium, low)` enum gloss to the `severity` mention in the Finding Format paragraph.

## Proposed Standard

Whenever a new frontmatter field or enum value is added to one of these two files, grep the other before landing. Rule belongs inline in both files (already implicit: README is the spec, TEMPLATE is the canonical example — they must agree). If this drifts again, consider generating TEMPLATE from a single source of truth.
