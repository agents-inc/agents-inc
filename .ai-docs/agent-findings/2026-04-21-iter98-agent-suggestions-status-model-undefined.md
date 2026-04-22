---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/agent-suggestions/2026-03-25-declarative-programming-no-context-required.md
  - .ai-docs/agent-suggestions/2026-04-13-documentation-restructure-proposal.md
standards_docs:
  - .ai-docs/agent-suggestions/README.md
date: 2026-04-21
reporting_agent: ralph-orchestrator
category: architecture
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: .ai-docs/agent-suggestions/README.md and TEMPLATE.md now exist, codifying status vocabulary and filter-by-frontmatter rule
---

## What Was Wrong

`.ai-docs/agent-suggestions/` has two files and no README or TEMPLATE. Unlike
`.ai-docs/agent-findings/` — which has an authoritative Resolution Model (`status: resolved` +
`resolved_by:`, no directory moves, filter by frontmatter) — agent-suggestions has no defined
status vocabulary, no template, no filter rules, and no guidance on when a suggestion is
considered closed.

During iter 98, two suggestion files needed status updates and I had to invent values
ad-hoc: `status: mostly-completed` (for the documentation-restructure proposal, where Phase 1
is done, Phase 2 largely done, Phase 3 partial — root monoliths `state-transitions.md` (500
lines) and `commands.md` (486 lines) still carry content alongside subdir homes) and
`status: absorbed-informally` (for the declarative-programming proposal, where the core idea
is present in `clean-code-standards.md` §1.3 as orchestrator language but not as a titled
section with the "can you read it without simulating?" test). Neither vocabulary is ratified.

The two directories serve different artifacts — findings are anti-pattern discoveries asking
for a standards rule; suggestions are larger proposals asking for architectural/organizational
changes — so they warrant different lifecycles, but both need an authoritative one.

## Fix Applied

- Updated `2026-04-13-documentation-restructure-proposal.md`: `status: proposal` ->
  `status: mostly-completed`, added `resolution_date` and `resolution_note` citing phase-by-phase
  completion and residual dual-homed root files.
- Updated `2026-03-25-declarative-programming-no-context-required.md`: added
  `status: absorbed-informally`, `resolution_date`, `resolution_note` pointing at the partial
  absorption in `clean-code-standards.md` §1.3 and what is still missing (titled section, the
  simulation-test rule, named-test-data rule).
- None of these values are yet documented in a README for the directory.

## Proposed Standard

Add `.ai-docs/agent-suggestions/README.md` with:

1. Purpose statement — suggestions are larger-than-finding architectural proposals (restructures,
   new patterns, directory reorganizations); findings are targeted rule-level gaps.
2. Status vocabulary (authoritative enum), suggested:
   - `proposal` — awaiting decision
   - `approved` — accepted, implementation tracked elsewhere (todo item or finding)
   - `in-progress` — partial implementation underway
   - `mostly-completed` — substantial portion done, concrete residual work documented
   - `absorbed-informally` — idea landed in standards/CLAUDE.md without a dedicated section
   - `absorbed` — idea landed with a dedicated section in a canonical doc
   - `rejected` — explicit decision not to proceed (with rationale in `resolution_note`)
   - `superseded` — replaced by a newer proposal (use `superseded_by:`)
3. Required paired frontmatter: `status:` + `resolution_date:` + `resolution_note:` on any
   non-`proposal` status (mirrors findings' `status: resolved` + `resolved_by:` pairing).
4. Filter-by-frontmatter rule (same as findings): consumers distinguish open from closed by
   reading frontmatter, never by directory location or file moves.
5. A lightweight TEMPLATE.md (headers: Current State, Problems Identified, Proposed Structure,
   Phases, Recommendation, Decision Needed — matches the existing 2026-04-13 file's shape).

Also cross-link from `.ai-docs/agent-findings/README.md` ("For larger restructure proposals,
see `.ai-docs/agent-suggestions/`") and add a one-line pointer from `.ai-docs/DOCUMENTATION_MAP.md`
if it isn't already there.
