---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/standards/prompt-bible.md
standards_docs:
  - .ai-docs/standards/prompt-bible.md
date: 2026-04-21
reporting_agent: parent-orchestrator
category: architecture
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: prompt-bible.md Section 8 "Multi-Agent Delegation (Project-Specific)" added with 8.1-8.5 subsections; version bumped to 2.1 per finding
---

## What Was Wrong

The prompt-bible (v2.0) covered universal prompt engineering techniques (self-reminder loops, investigation-first, XML tags, Sonnet/Opus tuning, etc.) but had zero project-specific guidance for this repo's multi-agent delegation patterns. Missing:

- Which sub-agent type to pick for which work (`cli-developer` vs `cli-tester` vs `codex-keeper` vs `general-purpose`).
- Required boilerplate every delegation prompt must carry (read CLAUDE.md, no git commands, scope fence, findings instruction, self-review, report format).
- Ralph-loop ergonomics (single focus per iter, structured reports with length caps, cross-referencing previous iter outcomes).
- Anti-patterns observed in this repo's history:
  - Terse one-liner delegation → shallow work.
  - Vague scope → collateral edits (iter 54: cli-tester scope-boundary misinterpretation).
  - Standards curation wrongly delegated to `general-purpose` (iter 55: codex-keeper standards-folder scope restriction caught).

Ralph iterations were repeatedly rediscovering the same "CLAUDE.md wasn't read" / "scope wasn't fenced" failures without the bible codifying the fix.

## Fix Applied

Added Section 8 "Multi-Agent Delegation (Project-Specific)" to `prompt-bible.md` covering:

- 8.1 Agent selection table with use/don't-use matrix + tie-breakers.
- 8.2 Required-boilerplate block (6 lines) with per-line rationale.
- 8.3 Ralph-loop DO/DO-NOT list.
- 8.4 Anti-patterns with before/after examples drawn from iter 54/55.
- 8.5 Copy-paste delegation template with `<preamble>`, `<task>`, `<context>`, `<constraints>`, `<report_format>` sections.

Also bumped version to 2.1, added TOC entry, updated version history.

## Proposed Standard

Keep Section 8 as the canonical reference for any new sub-agent delegation in this repo. Future Ralph iterations should cite it rather than re-deriving the boilerplate. When new agent types are added (or existing ones change scope), update the 8.1 table first; prompts elsewhere can then stay terse by linking to the bible.

Pair with CLAUDE.md's existing delegation rules — CLAUDE.md tells the parent to delegate; bible Section 8 tells the parent _how_ to write the delegation prompt.
