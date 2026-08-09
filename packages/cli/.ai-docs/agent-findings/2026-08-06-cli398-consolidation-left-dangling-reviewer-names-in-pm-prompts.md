---
type: convention-drift
severity: medium
affected_files:
  - src/agents/planning/cli-pm/identity.md
  - src/agents/planning/api-pm/identity.md
  - src/agents/planning/ai-pm/identity.md
  - src/agents/planning/web-pm/identity.md
  - src/agents/planning/api-pm/playbook.md
  - src/agents/planning/api-pm/output.md
  - src/agents/planning/cli-pm/output.md
  - src/agents/planning/ai-pm/playbook.md
  - src/agents/planning/ai-pm/output.md
  - src/agents/planning/ai-pm/critical-reminders.md
standards_docs:
  - .ai-docs/standards/prompt-bible.md
date: 2026-08-06
reporting_agent: general-purpose
category: architecture
domain: cli
root_cause: enforcement-gap
status: superseded
superseded_by: 2026-08-07-cli398s-prose-sweep-stopped-at-the-pm-prompts-twenty-reviewer-names-still-dangle.md
---

## What Was Wrong

CLI-398 consolidated the five domain reviewers into one `reviewer` agent and updated the roster
surfaces the audit enumerated (AGENT_NAMES, DOMAIN_AGENTS, default stacks, editor ids, test
expected-values). What nothing enumerated was the PROSE of the other agents' prompts: all four PM
agents kept instructing deferral to agents that no longer exist. `cli-pm/identity.md` said "Code
review -> cli-reviewer" (twice) and listed "coordinating handoffs to cli-developer, cli-tester,
and cli-reviewer"; `api-pm` deferred to `api-reviewer` in its identity, playbook findings-capture
line, and output guidance; `ai-pm` deferred to `ai-reviewer` in its identity, coordination
section, output guidance, and post-action reflection; `web-pm` deferred to "web-reviewer,
api-reviewer". Every compiled PM shipped with a handoff instruction naming a sub-agent Claude
Code cannot invoke.

## Fix Applied

Rewrote every stale reference to the consolidated `reviewer` (10 files across the four PM
directories) while relocating the PM playbooks' domain frameworks under CLI-399.

**The claim that followed was wrong and the successor finding carries the evidence:** this pass
asserted that a grep for `-reviewer` under `src/agents/` then matched only the `reviewer` agent
itself and the `meta-reviewing-*` skill ids. It was run over the four PM directories, not the tree
— fifteen other agents' partials still name per-domain reviewers, and did on the day this was
written. The PM directories themselves no longer exist: CLI-399 consolidated them into one `pm`,
whose prose names the consolidated `reviewer`.

## Proposed Standard

A roster rename is not done until the PROSE of every other agent's partials is grepped for the
old names. Concretely: add to the consolidation checklist (the CLI-398-shaped list in
`todo/cli.md` and any future roster change) a final step — `grep -rn "<old-name>"
src/agents/` must return nothing. This is the prompt-body sibling of the existing finding
`2026-08-05-builtin-agent-rosters-unbound-to-generated-agent-names.md` (which covers constants
and test expected-values, not prose). Longer term, the same lint that guards task IDs in test
names could guard retired agent names in `src/agents/**/*.md`, but the grep step is the minimal
correct gate today.
