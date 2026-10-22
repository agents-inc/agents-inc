---
type: standard-gap
severity: low
affected_files:
  - src/cli/lib/config-gate/index.ts
  - src/cli/lib/config-gate/recompile.ts
  - src/cli/lib/operations/project/recompile-project-agents.ts
  - src/cli/utils/messages.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  The fan-out snapshots each registered project's config pair before it runs, a project whose pair
  or agents changed counts as rewritten, and the line reads "Registered projects: N rewritten, M
  unchanged" (gate-consequences.test.ts, recompile-project-agents.test.ts).
---

## What Was Wrong

`Recompiled agents in N registered project(s), M unchanged` counted a project as rewritten only
when its compiled sub-agents changed. A project whose `config.ts` and `config-types.ts` the global
change had rewritten, but which compiled no sub-agent of its own, read as "unchanged". A T2 fan-out
(an inlined scalar, no recompile) printed `0 registered projects, 0 unchanged` after rewriting every
pair.

## Fix Applied

`snapshotProjectPairs` / `pairsRewrittenSince` (`config-gate/pair-snapshot.ts`) read each pair
around the fan-out; `recompilePropagatedProjectAgents` and `pairRewriteSummary` count a changed pair
as a rewrite. The line's subject is now the project, which it always named.

## Proposed Standard

`clean-code-standards.md`: a count line counts every surface the run writes for the noun it names.
Where it can only measure one, its noun names that one.

`standards/e2e/assertions.md` § "A counter is not its content" quotes the old line and its
measured examples; they describe the pre-change wording.
