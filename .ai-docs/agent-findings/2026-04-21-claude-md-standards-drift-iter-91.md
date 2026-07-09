---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/standards/clean-code-standards.md
  - CLAUDE.md
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-21
reporting_agent: general-purpose
category: architecture
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: clean-code-standards.md updated (sections 6.13-6.18, 7.10-7.12, 8.5-8.6, 15.2 ext, new 16 Scope Awareness, new 17 Repo Hygiene)
---

## What Was Wrong

Bidirectional sync audit (Ralph iter 91) found CLAUDE.md NEVER/ALWAYS rules that had no counterpart in `.ai-docs/standards/clean-code-standards.md`. The drift concentrated in scope-awareness (entirely unrepresented), fine-grained test-data factory rules (mock-matrices, AGENT_DEFS, config factories, content-generators), a few type-safety rules (`parseFrontmatter`, narrowest factory param types, redundant type aliases), and repo hygiene (no machine-specific absolute paths, no git worktrees).

CLAUDE.md is the operator-facing rule list; standards docs are the reviewer-facing enforcement surface. When a rule only lives in CLAUDE.md, sub-agents that are told "read the standards" won't see it.

## Root Cause

Rules accumulate in CLAUDE.md when they're added in response to a specific slip. They rarely get promoted into the reviewer-checkable standards doc because there's no automated bidirectional check. Iter 91 ran that check by hand.

## Fix Applied

Added to `clean-code-standards.md`:

- 6.13-6.18: pre-built matrix constants, config factories + AGENT_DEFS, content-generators, config+filesystem assertion, no `lastFrame` scanning, no inline parser/extractor helpers.
- 7.10-7.12: narrowest factory param types, `parseFrontmatter` as the single SKILL.md parser, no redundant type aliases (use Pick/Partial/Omit).
- 8.5-8.6: no constant-to-constant reassignment, prefer functional collection builders.
- 15.2 extended: no `path.basename(dir)` skill ID fallback, no deriving `slug` from ID/path.
- Section 16 (new): Scope Awareness — 5 rules covering `resolveInstallPaths`, local skill path scope checks, project+global merge, per-skill scope for plugin ops, saved-source precedence.
- Section 17 (new): Repository Hygiene — no machine-specific absolute paths, no worktrees.

Process-only rules (delegation, "tell sub-agent to read CLAUDE.md", "trace all scenarios", "move deferred tasks to TODO-deferred.md", "write a finding when…", git staging commands) remain in CLAUDE.md — they're behavioral directives for the orchestrator, not reviewer-checkable code rules.

## How to Prevent

Make this a recurring Ralph check: every N iterations, diff CLAUDE.md NEVER/ALWAYS bullets against the standards doc section headers. Any rule that affects code (not process) should exist in both places, with standards being the authoritative reviewer reference.
