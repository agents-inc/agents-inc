---
type: convention-drift
severity: medium
affected_files:
  - src/agents/planning/web-pm/identity.md
  - src/agents/planning/api-pm/identity.md
  - src/agents/planning/cli-pm/identity.md
  - src/agents/planning/ai-pm/identity.md
  - src/agents/meta/agent-summoner/playbook.md
  - src/agents/meta/agent-summoner/output.md
  - src/agents/meta/agent-summoner/identity.md
standards_docs:
  - .ai-docs/standards/prompt-bible.md
date: 2026-08-06
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: scope-discipline-deferred
status: resolved
resolved_by: >
  CLI-414 applied CLI-397's proportionality voice at the source, so the summoner can no longer
  re-issue the volume mandate and new agents are not born with it. Six sites changed: both
  playbook mandate sites (the identity-partial key point and the source-file checklist item now
  quote "thorough on what the task needs and silent on the rest"), the playbook's `identity.md`
  template block that Create Mode copies from, the summoner's own identity partial, and both
  output exemplars — plus the `prompt-bible.md` "Optimal structure" worked example. Verified by
  grep: zero occurrences of the phrase remain under `src/agents/meta/agent-summoner/` or
  `.ai-docs/standards/`. Proposed Standard items 2 and 3 are NOT closed by this pass and keep
  their owners — the bible still only demonstrates the principle in an example rather than
  stating it as a rule (item 2), and the 20 remaining `identity.md` carriers (every developer,
  tester, researcher and reviewer, plus codex-keeper, convention-keeper and skill-summoner) ride
  CLI-398 and later passes (item 3).
---

## What Was Wrong

CLI-397's narrowed pass replaced the unconditional "be comprehensive and thorough" mandate on the
four PM identities with a proportionality line. The mandate is not a per-agent authoring choice —
it is prescribed in two places that will re-issue it:

1. **`agent-summoner/playbook.md`** makes the phrase mandatory twice — as an identity-partial key
   point ("MUST include expansion modifiers") and again as a source-file checklist item
   ("`identity.md` has expansion modifiers"). Its identity partial and its output exemplars carry
   the phrase verbatim, so both Create Mode and Improve Mode reintroduce it — Improve Mode can
   legitimately read the four softened PMs as non-compliant and revert them.
2. **`.ai-docs/standards/prompt-bible.md`** presents the same line inside its "Optimal structure"
   worked example for an agent prompt, which is the document an agent reads to learn the shape.

Twenty-one other bundled agents still carry the phrase in `identity.md` (every developer, tester,
researcher, reviewer, and three meta agents). The four PMs are now the only exceptions, so a reader
comparing siblings sees an inconsistency with no recorded reason.

## Fix Applied

None — discovery only. CLI-397's narrowed scope is the four PM agents plus the reviewing skill's
cost gate; the reviewer prompts ride CLI-398's consolidation, and nothing authorises editing the
summoner or the prompt bible. The four PM identities were changed as specified and left
inconsistent with the standard that produced them, deliberately.

## Proposed Standard

1. Decide the mandate at the source, not per agent. If proportionality is the intended prompt
   principle, the change belongs in `agent-summoner/playbook.md` (both the key-points line and the
   source-file checklist), its identity/output exemplars, and the `prompt-bible.md` worked example
   — otherwise the softened PMs are a local exception the next summoner run erases.
2. Whichever way it is decided, the prompt bible should say so explicitly rather than only
   demonstrating it in an example. An "expansion modifier" line copied out of a worked example is
   how the phrase reached 25 agents; a stated rule can be argued with, an exemplar cannot.
3. The remaining 21 agents need a sweep or an explicit "PMs only" carve-out. A phrase that is
   mandatory in 21 prompts and forbidden in 4 is a coin-flip for the next author.
