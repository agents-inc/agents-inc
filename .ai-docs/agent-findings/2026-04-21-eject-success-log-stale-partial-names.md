---
type: convention-drift
severity: low
affected_files:
  - src/cli/commands/eject.ts
standards_docs: []
date: 2026-04-21
reporting_agent: ralph-audit
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`src/cli/commands/eject.ts` success log (non-`templatesOnly` branch) reads:

> "You can now customize templates, agent intro, workflow, and examples locally."

That vocabulary ("templates", "agent intro", "workflow", "examples") pre-dates the current agent-partial layout. Agents eject these partials today:

- `identity.md`
- `playbook.md`
- `critical-requirements.md`
- `critical-reminders.md`
- `output.md`

None of the four noun-phrases in the log line map onto a partial that actually ships. Users grepping `.claude/agents/**/_partials/` for any of the names in the message will find nothing.

## Fix Applied

None — discovery only. Code edit belongs to `cli-developer`.

## Proposed Standard

User-facing command messages that enumerate filesystem artifacts should name those artifacts by their actual filenames (or the documented partial labels), not by legacy conceptual buckets. When partial layout changes, success/log strings referencing the old names must be updated in the same commit. Candidate location for the rule: `.ai-docs/standards/clean-code-standards.md` (user-facing strings section) or a new bullet under the `cli/commands/` conventions in `DOCUMENTATION_MAP.md`.
