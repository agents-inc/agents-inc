---
date: YYYY-MM-DD
proposer: <agent-type> # or "orchestrator"
status: proposal # proposal | approved | in-progress | mostly-completed | absorbed-informally | absorbed | rejected | superseded
# Optional:
# affected_files:
#   - path/to/file.ts
# standards_docs:
#   - .ai-docs/standards/<doc>.md
# category: dry | typescript | testing | complexity | performance | architecture
# domain: e2e | cli | web | api | shared | infra
# Required when status is terminal (absorbed | absorbed-informally | mostly-completed | rejected | superseded):
# resolution_date: YYYY-MM-DD
# resolution_note: |
#   Cite mechanism of resolution: doc section, commit hash, superseding file, or reason for rejection.
#   For mostly-completed / absorbed-informally, enumerate the named residual.
# supersedes: <older-filename.md>
# superseded_by: <newer-filename.md>
---

<!--
How to resolve a suggestion:
- Edit this file in place. Do NOT move or rename it (cross-links break silently).
- Set `status:` to a terminal value AND add `resolution_date:` + `resolution_note:` — all three paired.
- See `README.md` → "Lifecycle" and "Status Enum" for the full rule.
-->

# <Proposal Title>

## Problem

<!-- What gap or opportunity motivates this proposal? -->

## Proposal

<!-- What should change? Be specific: name docs, sections, patterns. -->

## Rationale

<!-- Why this approach? What alternatives were considered? -->

## Risks / Open Questions

<!-- What could go wrong? What's undecided? -->
