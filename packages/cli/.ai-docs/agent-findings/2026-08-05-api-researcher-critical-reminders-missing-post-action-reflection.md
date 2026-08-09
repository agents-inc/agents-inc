---
type: convention-drift
severity: low
affected_files:
  - packages/cli/src/agents/researcher/api-researcher/critical-reminders.md
standards_docs:
  - .ai-docs/standards/prompt-bible.md
date: 2026-08-05
reporting_agent: agent-summoner
category: architecture
domain: shared
root_cause: enforcement-gap
status: resolved
resolved_by: Added the <post_action_reflection> block to
  src/agents/researcher/api-researcher/critical-reminders.md, matching web-researcher's
  placement (after the failure-consequence line) and question style, adapted to backend
  subject matter. Every critical-reminders.md on disk now carries the block. The two
  preventive measures under "Proposed Standard" below (prompt-bible partial-to-technique
  mapping, structural assertion over src/agents/*/*/) have NOT landed.
---

## What Was Wrong

`api-researcher/critical-reminders.md` is the only agent partial on disk that omits the
`<post_action_reflection>` block. Every other agent carries it:

```
$ for f in src/agents/*/*/critical-reminders.md; do
    grep -q "post_action_reflection" "$f" || echo "${f%/critical-reminders.md}"
  done
  researcher/api-researcher
```

24 of the 25 `critical-reminders.md` files have the block; `api-researcher` does not. Its
category sibling `web-researcher` does, and the two files are otherwise near-identical in
shape (emphatic repetition block, `## CRITICAL REMINDERS`, `**(You MUST ...)**` list, failure
consequence line), which is what makes the omission read as drift rather than a deliberate
choice for that agent.

`prompt-bible.md` lists post-action reflection as Technique #8 ("Improved long-horizon
reasoning") and names `<post_action_reflection>` in its recommended tag set, but it does not
state that the block belongs in the `critical-reminders.md` partial specifically. Nothing
validates partial structure at compile time either — `validateCompiledAgent()` runs only on
the legacy `compileAllAgents()` path, which has no production caller, and it checks the
compiled output rather than the source partials. So a partial can silently drop a technique
that the other 24 agents apply and no build step notices.

The practical cost is small but real: `api-researcher` is the one agent with no instruction
to pause and evaluate whether its file paths were verified and its claims were evidenced
before reporting — the exact check a read-only research agent most needs.

## Fix Applied

The finding surfaced while creating `cli-researcher`, whose scope fence was "create files
ONLY in `src/agents/researcher/cli-researcher/`", so `api-researcher` was deliberately left
untouched at the time. `cli-researcher` itself was authored with the block, matching the
24-agent majority.

Closed 2026-08-05 during the roster-alignment pass: `api-researcher/critical-reminders.md`
now carries a `<post_action_reflection>` block placed exactly where `web-researcher` puts
its own — after the failure-consequence line, at the bottom of the partial — with the same
"After each major research action, evaluate:" framing and closing "Only report findings when
you have verified evidence for all claims." line, and its five questions rewritten for
backend subject matter (routes, schemas, middleware). The unanimity the finding described is
now literal: every `critical-reminders.md` under `src/agents/*/*/` contains the block.

The two preventive measures below remain unimplemented, so the next omission would still go
unnoticed until someone audits by hand.

## Proposed Standard

Two options, not mutually exclusive:

1. **Document the placement.** `.ai-docs/standards/prompt-bible.md` -> section 2 ("Optimal
   Prompt Structure & Ordering") already maps techniques to canonical positions. Add a
   partial-level mapping for this repo's agent system stating which partial owns each
   technique — `<self_correction_triggers>` in `critical-requirements.md`,
   `<post_action_reflection>` in `critical-reminders.md`, `<domain_scope>` in `identity.md`,
   `<retrieval_strategy>` in `playbook.md`. Today that mapping exists only as an emergent
   convention readable by diffing agents against each other.

2. **Make it checkable.** A structural assertion over `src/agents/*/*/` — every
   `critical-reminders.md` contains `<post_action_reflection>`, every
   `critical-requirements.md` contains `<self_correction_triggers>`, every `identity.md`
   contains `<domain_scope>` — would catch the next omission at test time instead of at the
   next manual audit. This is the cheaper half: the convention is already unanimous minus one,
   so the assertion encodes existing reality rather than imposing a new rule.
