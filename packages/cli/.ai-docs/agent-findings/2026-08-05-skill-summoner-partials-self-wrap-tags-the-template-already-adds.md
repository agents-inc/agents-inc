---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/agents/meta/skill-summoner/critical-requirements.md
  - packages/cli/src/agents/meta/skill-summoner/critical-reminders.md
standards_docs:
  - .ai-docs/standards/prompt-bible.md
  - .ai-docs/reference/features/agent-system.md
date: 2026-08-05
reporting_agent: agent-summoner
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  Removed the four self-added wrapper lines from skill-summoner's
  critical-requirements.md and critical-reminders.md, and moved its existing
  <self_correction_triggers> block from critical-reminders.md (where it was misplaced) into
  critical-requirements.md, directly after the MUST list — agent-summoner's placement.
  Verified by rendering skill-summoner through agent.liquid: one <critical_requirements> and
  one <critical_reminders> wrapper, each opening straight onto content. The two preventive
  measures under "Proposed Standard" below have NOT landed.
---

## What Was Wrong

`agent.liquid` wraps two partials in XML tags itself:

```liquid
<critical_requirements>
{{ criticalRequirementsTop }}
</critical_requirements>
...
<critical_reminders>
{{ criticalReminders }}
</critical_reminders>
```

So a partial must contain the rules only, never the wrapper. Twenty-four of the twenty-five
agents do exactly that. `skill-summoner` does not: both of its partials open with the wrapper
tag on line 1 and close with it on the last content line, so the compiled agent carries

```
<critical_requirements>
<critical_requirements>
...
</critical_requirements>
</critical_requirements>
```

for the top block and the same doubling for the bottom one. It is the only agent on disk that
does this:

```
$ for f in src/agents/*/*/critical-requirements.md; do
    grep -q "^<critical_requirements>" "$f" && echo "$f"
  done
  meta/skill-summoner/critical-requirements.md
$ for f in src/agents/*/*/critical-reminders.md; do
    grep -q "^<critical_reminders>" "$f" && echo "$f"
  done
  meta/skill-summoner/critical-reminders.md
```

Nested identical tags are not a rendering error — the markdown still reads — but they cost the
technique its point. Prompt-bible §3 keeps nesting at ≤3 levels and treats a tag as a
boundary marker; a boundary that appears twice around the same content is noise where the
structure is supposed to be doing the work, and the redundant pair is exactly what an agent
reading its own prompt has to disambiguate.

**Correction to this finding as first written:** it claimed `skill-summoner` had no
`<self_correction_triggers>` block. It had one — in `critical-reminders.md`, which is the
wrong partial. Every other agent puts self-correction in `critical-requirements.md`, where a
checkpoint is read before work begins rather than after. The original claim came from a scan
of `critical-requirements.md` alone, which reports a misplaced block and a missing one
identically. A placement convention needs to be checked as "in this file and not that one".

Both are the same class as
`2026-08-05-api-researcher-critical-reminders-missing-post-action-reflection.md`: the partial
contract is documented in `reference/features/agent-system.md` as prose and enforced nowhere.
`validateCompiledAgent()` inspects compiled output and runs only on the legacy
`compileAllAgents()` path, which has no production caller.

## Fix Applied

Found during a roster-alignment audit whose scope was the five newly created agents
(`ai-pm`, `cli-pm`, `ai-researcher`, `cli-researcher`, `ai-tester`) plus a stale-reference
purge, so it was recorded rather than fixed. The coordinator then widened the fence and it
was fixed the same day:

- The four wrapper lines were deleted. Both partials now start on their `##` heading.
- The `<self_correction_triggers>` block moved verbatim from `critical-reminders.md` into
  `critical-requirements.md`, directly after the MUST list and before
  `<content_preservation_rules>` — the position `agent-summoner` uses. No checkpoint text
  changed; `content_preservation_rules` was left where it was.
- `critical-reminders.md` keeps its MUST list, failure-consequence line, Write Verification
  Protocol and `<post_action_reflection>`.

Verified by rendering the agent through `agent.liquid` with LiquidJS: the compiled prompt
carries exactly one `<critical_requirements>` and one `<critical_reminders>` wrapper, each
opening directly onto content. The other four `critical_re*` tag pairs in the output all
originate in `output.md`, where `skill-summoner` shows the SKILL.md template it emits —
skills legitimately carry those bookends per prompt-bible §3 (Skill-Content Tags), and they
are balanced.

A repo-wide rescan now reports zero self-wrapped partials and zero
`critical-requirements.md` without a `<self_correction_triggers>` block.

## Proposed Standard

The structural assertion already proposed in the api-researcher finding covers both defects if
it is written to check for absence as well as presence:

- every `critical-requirements.md` contains `<self_correction_triggers>` and does NOT contain
  `<critical_requirements>`
- every `critical-reminders.md` contains `<post_action_reflection>` and does NOT contain
  `<critical_reminders>`
- every `identity.md` contains `<domain_scope>` and does NOT contain `<role>`

The negative half matters more than the positive half here: a missing technique degrades one
agent, while a self-wrapped partial silently duplicates a structural marker the template owns,
and neither shows up in a diff review that reads one file at a time.
