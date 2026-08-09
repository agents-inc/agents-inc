---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/stores/wizard-store.ts
standards_docs:
  - .ai-docs/reference/features/agent-system.md
date: 2026-08-06
reporting_agent: general-purpose
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: Set-union dedupe in preselectAgentsFromDomains plus a wizard-store test pinning "reviewer appears exactly once" for a web+api selection (CLI-398 consolidation)
---

## What Was Wrong

`preselectAgentsFromDomains` built the roster as
`selectedDomains.flatMap((domain) => DOMAIN_AGENTS[domain] ?? []).sort()` — a flat concatenation
that silently assumed the per-domain rosters are DISJOINT. That held while every agent carried a
domain prefix, and nothing documented or tested it. The reviewer consolidation broke the
assumption by design: every implementation domain now rosters the shared `reviewer`, so a web+api
selection would have produced `selectedAgents` containing `"reviewer"` twice and two duplicate
`agentConfigs` rows built from it — a corrupt selection state one step before config generation.

## Fix Applied

The union is now deduped (`[...new Set(...)].sort()`) with a comment naming why, and
`wizard-store.test.ts` pins that a multi-domain preselection carries `reviewer` exactly once. The
sibling `preselectAgentsFromStack` already deduped (`[...new Set([...stackAgents, ...globalAgents])]`),
which is itself evidence the invariant was known in one place and assumed in the other.

## Proposed Standard

Any union built from overlapping-by-design data sources must dedupe at the point of union, and the
overlap must be stated where the data is declared. `DOMAIN_AGENTS`' doc comment now states that
every domain rosters the shared reviewer; keep that comment adjacent to the table so the next
roster change re-reads it. Candidate rule home: `.ai-docs/standards/clean-code-standards.md`
(collection-building section) — "when two inputs can name the same member, the union spells the
dedupe, not the hope".
