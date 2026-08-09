---
type: standard-gap
severity: medium
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/components/wizard/step-agents.tsx
  - src/cli/types/generated/source-types.ts
  - README.md
standards_docs:
  - .ai-docs/reference/features/agent-system.md
date: 2026-08-05
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

The built-in agent roster is written down in four places that must agree, and nothing checks that
they do:

| Surface                                            | What it lists                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `AGENT_NAMES` (`types/generated/source-types.ts`)  | generated from `src/agents/*/metadata.yaml` — the only derived one |
| `DOMAIN_AGENTS` (`stores/wizard-store.ts`)         | which agents a chosen domain preselects                            |
| `BUILT_IN_AGENT_GROUPS` (`wizard/step-agents.tsx`) | which agents the grid lets you toggle                              |
| `README.md` "Subagents" table                      | the published roster                                               |

Only the first is generated. The other three are hand-maintained, and `DOMAIN_AGENTS` and
`BUILT_IN_AGENT_GROUPS` are **file-local** — not exported — so a test cannot import them to compare
against `AGENT_NAMES` even if someone wanted to.

The result is that the three hand-written rosters drift silently. Deleting an agent directory is
caught by `tsc` (its name leaves the `AgentName` union, so stale entries fail to typecheck), but
**adding** one is caught by nothing. Before this change the repo had been sitting on exactly that
drift: `api-pm`, `api-tester`, `ai-developer`, `ai-reviewer`, `convention-keeper` and
`infra-reviewer` were all valid `AgentName`s with agent directories on disk, yet six of them
appeared in neither `DOMAIN_AGENTS` nor `BUILT_IN_AGENT_GROUPS` — so they shipped in the package,
were documented in `agent-system.md`, and were unreachable through the wizard. `agent-system.md`
records this as a fact about the system ("The six built-in agents with NO grid row...") rather than
as the defect it is.

This is the same failure mode CLAUDE.md already calls out for skill keys — "two surfaces each
writing their own skill key is what made the Sources tab and the confirm step disagree" — but the
agent roster has no equivalent shared definition.

## Fix Applied

None for the gap itself — discovery only. The immediate drift was corrected by hand as part of the
five-role × four-domain roster reorganization: `DOMAIN_AGENTS` and `BUILT_IN_AGENT_GROUPS` now both
carry all four domains at five roles each, and the README table matches. That correction was manual
and unverified by any test, which is precisely the problem this finding records.

Note the asymmetry that made the manual pass survivable: the three retired agents
(`web-architecture`, `pattern-scout`, `web-pattern-critique`) produced 25 `tsc` errors the moment
their directories were deleted, so removals are self-checking. The five additions produced none.

## Proposed Standard

Add a roster-invariant unit test — the cheapest form, since all the data is static and already in
the process:

1. Export `DOMAIN_AGENTS` from `stores/wizard-store.ts` and `BUILT_IN_AGENT_GROUPS` from
   `wizard/step-agents.tsx`. This is a sanctioned export under CLAUDE.md's "Code Style" exception:
   both are identity rosters that more than one surface must agree on, which is the stated reason
   `skillSlotKey` / `agentSlotKey` are exported ahead of a second caller.
2. Assert, in a new `src/cli/components/wizard/__tests__/agent-roster.test.ts`:
   - every id in `DOMAIN_AGENTS` and `BUILT_IN_AGENT_GROUPS` is in `AGENT_NAMES` (catches typos and
     stale entries — today only `tsc` catches these, and only for deletions);
   - every domain-prefixed name in `AGENT_NAMES` appears in **both** the grid and `DOMAIN_AGENTS`
     for its domain (catches the addition case, which nothing catches today);
   - any deliberate omission is an explicit allowlist constant with a comment naming the reason,
     so "unreachable through the wizard" has to be chosen rather than defaulted into.

Document the invariant in `.ai-docs/reference/features/agent-system.md` under "Wizard Domain
Mapping", replacing the current prose that enumerates which agents lack a grid row — that list is a
snapshot of the drift and goes stale on every roster change. The test should own the count, not the
doc, per documentation-bible.md's "A Count Lives in Exactly One Document".

The README table stays manual; a test asserting prose formatting is not worth its maintenance. But
the release checklist in `.ai-docs/standards/commit-protocol.md` should gain one line: when
`AGENT_NAMES` changes, update the README "Subagents" table.
