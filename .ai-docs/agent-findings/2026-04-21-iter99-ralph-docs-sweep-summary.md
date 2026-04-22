---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/
  - CLAUDE.md
  - .ai-docs/standards/
  - .ai-docs/agent-findings/
  - .ai-docs/DOCUMENTATION_MAP.md
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
  - .ai-docs/agent-findings/README.md
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-04-21
reporting_agent: general-purpose
category: architecture
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: iter99-summary — 99-iter ralph docs-sweep loop closed; residuals tracked in open findings
---

## What Was Wrong

99 iterations of a ralph loop (codex-keeper as default, general-purpose for standards/ sweeps, cli-tester for code-touching changes) were run against `.ai-docs/`, `CLAUDE.md`, `.ai-docs/standards/`, `.ai-docs/agent-findings/`, and `DOCUMENTATION_MAP.md`. The loop uncovered pervasive convention drift, stale content, and self-governance gaps in the documentation substrate itself — problems that had accumulated silently because no single iteration of normal work ever audits the whole doc tree.

## Fix Applied

**Totals across 99 iters:**

- ~100 findings filed, ~30 doc drifts corrected in place.
- New rules added to 8+ standards docs.
- Full directory audit for cross-link, frontmatter, staleness, and symmetry invariants.

**Status classification complete (post-iter-99).** All 49 2026-04-21 findings have explicit `status:` frontmatter after 3 audit batches. Breakdown:

- 2026-04-21 window: 33 resolved / 10 partial / 5 open / 1 superseded.
- 2026-04-17 window: 6 resolved / 1 open (pre-existing, confirmed still open).
- Pre-2026-04-16 window: all resolved.
- `partial` is a new status enum value for findings where fix is partially landed but follow-up work remains.

**Biggest wins:**

- Documentation-restructure proposal (`2026-04-10-documentation-restructure-proposal.md`) tracked to mostly-complete.
- Agent-findings lifecycle codified as status-as-frontmatter model at iter 83 (`2026-04-18-findings-status-as-frontmatter.md`, `agent-findings/README.md`).
- ~15 rules bidirectionally synced between `CLAUDE.md` and `clean-code-standards.md` (see `2026-04-18-claudemd-standards-bidirectional-sync.md`).
- Phantom references — functions, files, counts — flagged across 10+ docs (`2026-04-13-documentation-line-number-drift.md`, `2026-04-19-phantom-function-references-sweep.md`).
- Stale monolithic docs (type-system, test-infrastructure) converted to pointer stubs.
- `findings-impact-report.md` regenerated with 11 systemic patterns.

**Systemic patterns uncovered:**

- `CLAUDE.md` ↔ standards bidirectional drift (rules added one side only).
- Monolithic-vs-stubbed doc drift — two homes for the same concept diverge.
- Bible-section gaps (`prompt-bible.md`, `loop-prompts-bible.md` missing sections other docs reference).
- Findings-system self-governance gaps: filename conventions, status fields, frontmatter schema were themselves undocumented until mid-loop.

**Residual work:**

- `state-transitions.md` + `commands.md` dual-home drift: **RESOLVED.** Migrations + cross-ref updates completed — `wizard/state-transitions.md` and `commands/` subdir are now canonical; root files are pointers. See `2026-04-21-state-transitions-doc-drift.md` (resolved) and `2026-04-21-commands-doc-drift-iter25.md` (resolved). The iter101 correction finding is now `superseded`.
- 15 partial/open 2026-04-21 findings + 1 open 2026-04-17 finding remain as tracked follow-up.
- `agent-suggestions/` directory lacks a status model parallel to `agent-findings/` — tracked in `2026-04-21-iter98-agent-suggestions-status-model-undefined.md` (resolved).

## Proposed Standard

**Meta-observation:** The effective division was codex-keeper as default (fast, cheap sweeps), general-purpose for standards/ (needs broad reading), cli-tester for any code-touching doc claim (needs to run tests to verify). This division should be codified in `.ai-docs/standards/subagent-delegation.md` as the canonical ralph-loop routing for doc-maintenance passes. Future ralph sweeps over documentation should default to this 3-agent routing rather than single-agent.
