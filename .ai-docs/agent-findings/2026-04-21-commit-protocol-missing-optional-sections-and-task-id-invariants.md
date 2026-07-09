---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/standards/commit-protocol.md
standards_docs:
  - .ai-docs/standards/commit-protocol.md
date: 2026-04-21
reporting_agent: orchestrator
category: architecture
domain: infra
root_cause: convention-undocumented
status: resolved
resolved_by: commit-protocol.md updated (em-dash title rule, task-ID coverage, optional Backlog/Findings/Proposed standards sections codified)
---

# Commit protocol missing optional-section guidance and task-ID invariants

**Scope:** `.ai-docs/standards/commit-protocol.md`
**Severity:** Low (documentation drift; recent releases already follow the missing rules by convention)

## What was missing

`commit-protocol.md` defined only the four-section detailed-changelog template (`Added` / `Changed` / `Fixed` / `Removed`). Recent releases (0.137.0, 0.138.0, 0.140.0, 0.141.0) consistently added three more sections — `## Backlog`, `## Findings`, `## Proposed standards` — without any standards reference. New releases risked either dropping them or ordering them inconsistently.

Also missing:

- Em-dash separator rule in release commit title (`chore(release): 0.141.0 — summary`, not ASCII hyphen) — enforced by convention in every release commit since 0.130+, never written down.
- Task-ID coverage invariant — release summary parentheses, detailed-changelog `### D-xxx —` subheadings, and CHANGELOG.md summary bullets must all cite the same set of task IDs.
- Findings-path existence invariant — listed findings paths must exist on disk (no dangling references).

## What was added

`commit-protocol.md`:

- Release checklist gained three new items: em-dash title, task-ID coverage in summary, findings-path existence.
- Detailed-changelog template gained a headline-line requirement and an "Optional sections" block specifying `Backlog` / `Findings` / `Proposed standards` with prescribed order.
- `### D-xxx —` subheading convention codified for multi-ticket release bundles.

## Evidence of prior practice

- `changelogs/0.141.0.md` — uses all three optional sections in order.
- `changelogs/0.140.0.md` — uses `## Backlog`, `## Findings`.
- `changelogs/0.138.0.md`, `0.137.0.md` — use `### D-xxx — {title}` bundled-fix pattern.
- All release commits from 0.133.0 onward use em-dash separator.

## Follow-up

None. Protocol now matches observed practice. Future releases cite this standard rather than reinventing section order.
