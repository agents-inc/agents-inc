---
type: standard-gap
severity: medium
affected_files:
  - src/agents/meta/skill-summoner/metadata.yaml
  - docs/briefing.md
standards_docs:
  - docs/briefing.md
date: 2026-10-20
reporting_agent: skill-summoner
category: architecture
domain: infra
root_cause: missing-rule
status: open
---

## What Was Wrong

The R44 skills lanes are briefed to type-check every added block with `tsc --noEmit` in a temp project
with the library installed from npm, to gate on `bun run validate` in the skills repository, and to
read library APIs through the context7 MCP tools. The reporting lane (S5-skills-17) ran as
`skill-summoner`, whose `tools:` in `src/agents/meta/skill-summoner/metadata.yaml` are Read, Write,
Edit, Grep, Glob, WebSearch and WebFetch: no shell, and no MCP tools. None of the three can be run by
the lane. The other lane notes below record the same tool list; which agent each ran as is not
recorded in them.

Census of the programme's lane notes, which other lanes were still writing: `grep -liE 'no (bash|shell)'
~/.claude/projects/-home-vince-dev-cli/<session>/r44/followups/*.md`. When this was written it named
every S-lane note on disk (S1-docs, S1-docs-fix, S2-skills-18, S3-skills-19, S4-skills-20,
S4-skills-20-fix, S5-skills-17, S6-skills-16) and neither F-lane note. Each lane substituted something
weaker (published `.d.ts` read over WebFetch, context7's HTTP API) and reported the gate as not run.

`briefing.md` -> "What a brief must contain" requires a **Gates** field holding "the exact commands to
run", and nothing requires those commands to be runnable by the agent receiving them. The same gap
shows a level down in `2026-10-20-a-skill-example-can-pass-a-value-its-librarys-types-reject-and-nothing-compiles-it-against-the-library`,
whose evidence is "derived from the published `.d.ts` ... not from a `tsc` run: the agent had no shell."

## Fix Applied

None — discovery only. This lane wrote its blocks into a ready-to-run project (`npm install && npm run
typecheck`) so whoever holds a shell can run the gate unchanged.

## Proposed Standard

One of two, and the owner's to choose:

- `briefing.md`, Gates row: "commands the dispatched agent's `tools:` can run; any it cannot are named
  as the orchestrator's, and the report hands back the ready-to-run invocation."
- Or add `Bash` to `skill-summoner`'s `tools:`. Its playbook phrases its completion checks as "each run
  with a tool this agent holds", which reads as deliberate, so this one reverses a choice rather than
  filling a gap.

Not checked against `CLAUDE.md` beyond its NEVER/ALWAYS lists, where neither proposal conflicts.
