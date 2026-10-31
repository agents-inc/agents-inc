---
type: audit
severity: medium
affected_files:
  - CLAUDE.md
standards_docs:
  - CLAUDE.md
  - docs/briefing.md
date: 2026-10-26
reporting_agent: orchestrator
category: performance
domain: infra
root_cause: missing-rule
status: open
---

## What Was Wrong

A multi-agent run spends almost all its tokens re-reading context, not producing output. Measured
on 2026-10-26 from the `usage` fields of assistant messages (`cache_read_input_tokens`,
`cache_creation_input_tokens`, `input_tokens`, `output_tokens`) in the transcripts of the sub-agents
of session f0e04877, over its last 24 hours. A census of that window, not a sample.

- 203 sub-agents, 4.9B tokens: 94% cache reads, 6% cache creation, about 1% output (26M).
- An agent's cost is roughly steps x context per step. Median agent: about 116 steps; context about
  51k at its first step (instructions, tool list, CLAUDE.md files, the memory index, its brief),
  about 189k at its last (p90 306k, max 606k), about 151k average, so about 17M tokens. The largest
  (reviewers reproducing every claim) ran 330-430 steps, 100-150M each.
- What fills the context: about 63% shell output (test logs, greps), about 37% file reads. Of the
  shell commands, about 81% are look-ups (grep/cat/ls/sed/head), about 9% tests and gates, about 5%
  waiting on a lock.
- The orchestrator session itself: about 6,000 steps averaging about 430k context each, about 2.7B
  tokens, the single largest consumer. Its compaction trigger was lowered to 200k in `CLAUDE.md`.
- Cache reads are billed at a fraction of fresh input, so the raw count overstates cost.

## Fix Applied

Lever h only (orchestrator compaction at 200k, adopted 2026-10-26). The rest is discovery; the
owner: "we will try them at a later stage". None is adopted.

## Proposed Standard

Levers to try later. Not approved instructions.

- a. Skip a further review for a small tests-only fix when the reviewer already simulated the exact
  change and the fixer re-runs the reviewer's breaks.
- b. A cheaper model for mechanical stages: applying patches, re-running gates, reading logs.
- c. Demonstrate only the key deliberate breaks rather than a per-condition census.
- d. Orchestrator: fewer check-ins, combined watches, batched landing summaries.
- e. Fewer steps per agent: carry measured facts in the brief so agents do not search for them.
  Conflicts with `briefing.md` "re-derive before you write" and "a brief carries the command, not
  its result"; an exception would have to be argued.
- f. Smaller starting context for sub-agents: they load tool lists they never use (Notion, Chrome,
  Docs MCP servers) and the full memory index.
- g. Quieter test output: a short reporter on screen, the full log to a file.
- h. Orchestrator: compact at 200k (adopted 2026-10-26) or restart from the hand-off file
  (`todo/plans/REPO-44-next.md`).

Lever a conflicts with the "verifier is never the fixer" ruling only if the fixer's re-run replaces
independent verification; it must not.
