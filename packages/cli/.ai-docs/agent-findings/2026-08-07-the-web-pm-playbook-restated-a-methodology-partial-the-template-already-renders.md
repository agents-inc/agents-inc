---
type: anti-pattern
severity: low
affected_files:
  - src/agents/planning/pm/playbook.md
  - src/agents/_templates/agent.liquid
  - src/agents/_templates/methodologies/success-criteria.liquid
standards_docs:
  - .ai-docs/reference/features/agent-system.md
  - .ai-docs/standards/prompt-bible.md
date: 2026-08-07
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: The duplicate was dropped when the four PM prompts were composed into one `pm` under CLI-399; the surviving section is the ownership loop the shared partial does not carry. No agent partial restates a rendered methodology partial today (grepped on the three partials' distinctive lines).
---

## What Was Wrong

`agent.liquid` renders five methodology partials into every compiled agent, `success-criteria`
among them. `planning/web-pm/playbook.md` then restated it: a `## Success Criteria Template`
section carrying the same "Success criteria must be: 1. Specific 2. Measurable…" list, the same
`<success_criteria>` XML block, the same good-vs-bad examples and the same verification checklist
as `_templates/methodologies/success-criteria.liquid`. Every compiled `web-pm.md` shipped roughly
3KB of it twice, several hundred lines apart, and a reader hitting the second copy had no way to
tell it was the same rule rather than a second, subtly different one.

The other three PM playbooks did not carry it, so the duplication was one agent's drift rather
than a role-wide pattern — and nothing flagged it, because a partial is free text and the template
concatenates whatever it is given.

## Fix Applied

The consolidated `pm` playbook (CLI-399) drops the restatement and keeps only the part the shared
partial genuinely lacks: who owns a success criterion at each step of the loop (PM defines,
developer verifies, reviewer confirms) and the rule that a criterion written after the work
ratifies whatever shipped. That section now points at the rendered template above it rather than
repeating it.

Checked the rest of the roster while there: grepping the three most distinctive lines of the
methodology partials (`Success criteria must be:`, `VERIFICATION FAILED`, `complexity_check`)
matches only the partials themselves. This was the sole instance.

## Proposed Standard

`reference/features/agent-system.md` documents which partials the template renders but never says
what that means for a partial's author. It should: **an agent partial must not restate a
methodology partial the template already renders — reference it or extend it.** The extension case
is the one worth naming, because it is what the fix here did: content that ADDS to a rendered
partial (ownership, sequencing, a role-specific caveat) is legitimate; content that repeats it is
a second copy of a rule that can drift.

A grep gate is available if this recurs — one distinctive line per methodology partial, matched
against `src/agents/**/*.md` — but with one instance in eighteen agents, the documented rule is
the proportionate response.
