---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/agent-findings/2026-04-21-iter99-ralph-docs-sweep-summary.md
  - .ai-docs/DOCUMENTATION_MAP.md
  - .ai-docs/reference/state-transitions.md
  - .ai-docs/reference/commands.md
  - .ai-docs/reference/wizard/state-transitions.md
  - .ai-docs/reference/commands/index.md
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: convention-undocumented
status: superseded
partial_note: iter 101 correction was filed, but subsequent iters collapsed the residual differently — reference/state-transitions.md and reference/commands.md are now 25/23-line stubs themselves (not ~500-line canonicals as claimed here). Direction of migration was reversed by later work; this finding's "root-is-canonical" description no longer matches disk state.
---

## What Was Wrong

The iter 99 summary and the iter 100 `DOCUMENTATION_MAP.md` closing stanza described the `state-transitions.md` / `commands.md` dual-home residual as "pointer stubs designed but not yet applied" — which implies the subdir files need to be created or that the root files should be converted to pointers.

Actual state on disk (iter 101 audit):

| File                                    | Lines | Role         |
| --------------------------------------- | ----- | ------------ |
| `reference/state-transitions.md`        | ~500  | CANONICAL    |
| `reference/commands.md`                 | ~486  | CANONICAL    |
| `reference/wizard/state-transitions.md` | 26    | reverse-stub |
| `reference/commands/index.md`           | 33    | reverse-stub |

The subdir files already exist and contain text explicitly stating "Full content: See `reference/...` -- this file is the authoritative source until cleanup." They point BACKWARDS to root.

Following the iter 99 phrasing literally (e.g., "convert root to a pointer") would destroy ~1000 lines of canonical content.

## Fix Applied

- Updated the "Residual work" section of `2026-04-21-iter99-ralph-docs-sweep-summary.md` with an iter-101 correction clarifying root-is-canonical and subdir-is-reverse-stub.
- Updated the "Residual Drifts (for next maintainer)" section of `DOCUMENTATION_MAP.md` with the same correction and direction ("move content INTO subdirs, flip stubs").
- Filed this finding to make the inversion explicit for the next maintainer.

## Proposed Standard

When documenting a pending split/migration residual, always state explicitly:

1. Which file is canonical (with line count).
2. Which file is the stub (with line count).
3. Direction of the pending move (source → destination).

Ambiguous phrasing like "pointer stubs designed but not yet applied" should be avoided — it does not disambiguate which side currently holds the content. Propose adding this rule to `.ai-docs/standards/documentation-bible.md` under the section covering dual-home / migration annotations.
