---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/standards/prompt-bible.md
standards_docs:
  - .ai-docs/standards/prompt-bible.md
date: 2026-04-21
reporting_agent: general-purpose
category: architecture
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: prompt-bible.md §3 "Skill-Content Tags (vs Agent-Prompt Tags)" subsection (lines 902+) documents the tag set and cross-refers from Required/Recommended lists
---

## What Was Wrong

Ralph iter 74 spot-checked 17 live skills at `/home/vince/dev/skills/src/skills/` against `prompt-bible.md` §3 XML Tag Standards. All skills use a consistent, stable set of **content-structure XML tags** that the bible does not document:

- `<philosophy>` — "why this tool / when to use" framing (all 17/17)
- `<patterns>` — core pattern library (all 17/17)
- `<red_flags>` — anti-patterns, gotchas, common mistakes (all 17/17)
- `<decision_framework>` — "when to pick X vs Y" (9/17)
- `<integration>` — cross-skill integration notes (2/17)
- `<performance>` — perf tuning section (3/17)
- `<migration_notice>` — version-migration callout (1/17, Remix)

Bible §3 "XML Naming Conventions" lists only agent/prompt tags (`<thinking>`, `<planning>`, `<investigation_notes>`, `<critical_requirements>`, `<critical_reminders>`, etc.) — nothing for the skill-content layer. A new skill author reading the bible wouldn't know these are the project's standard content tags; conversely, a bible reader auditing a skill has no authoritative list to check against.

Emphatic repetition (Technique #3): skills **do** comply — every spot-checked skill has matching `<critical_requirements>` (top) and `<critical_reminders>` (bottom) with `**(You MUST ...)**` format and a closing "Failure to follow these rules will…" line. No drift there.

Self-reminder loop (Technique #1) and dual final reminder are **absent** from skills by design — skills are reference content loaded into an agent's context, not standalone agents, so the self-reminder pattern belongs to the calling agent. That should be called out in the bible so reviewers don't flag it as a gap.

## Fix Applied

None — discovery only. Finding filed for `codex-keeper` to extend `prompt-bible.md` §3.

## Proposed Standard

Add a subsection to `prompt-bible.md` §3 titled **"Skill-Content Tags (vs Agent-Prompt Tags)"**:

1. List the canonical skill content tags with one-line semantics:
   - `<philosophy>` — why/when framing for the tool
   - `<patterns>` — core pattern library (numbered patterns)
   - `<red_flags>` — anti-patterns, gotchas, common mistakes
   - `<decision_framework>` — comparative "pick X vs Y" guidance
   - `<integration>` — cross-skill integration notes (optional)
   - `<performance>` — perf tuning (optional)
   - `<migration_notice>` — version-migration callout (optional)

2. Clarify that skills use only the **bookend tags** (`<critical_requirements>` / `<critical_reminders>`) from Technique #3, and do NOT need `<core_principles>`, self-reminder loops, or dual final reminders — those are agent-prompt concerns.

3. Add a one-line cross-reference from the Required/Recommended tag lists noting "skill files use a different tag set — see Skill-Content Tags subsection."

This closes the documentation gap without changing any live skill (which would be churn for no gain — the convention is already stable across 17/17 spot-checked skills).
