---
type: convention-drift
severity: medium
affected_files:
  - src/agents/tester/api-tester/critical-requirements.md
  - src/agents/tester/api-tester/critical-reminders.md
  - src/agents/tester/api-tester/identity.md
  - src/agents/developer/ai-developer/critical-requirements.md
  - src/agents/developer/ai-developer/critical-reminders.md
  - src/agents/developer/ai-developer/playbook.md
  - src/agents/reviewer/ai-reviewer/playbook.md
  - src/agents/reviewer/cli-reviewer/critical-reminders.md
  - src/agents/reviewer/infra-reviewer/critical-reminders.md
  - src/agents/reviewer/infra-reviewer/playbook.md
  - src/agents/planning/api-pm/playbook.md
standards_docs:
  - .ai-docs/standards/prompt-bible.md
date: 2026-08-05
reporting_agent: agent-summoner
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

Eleven partials across six built-in agents give the end user's compiled agent instructions that only
make sense inside this repository:

- A "You MUST write a finding to .ai-docs/agent-findings/, using the template in
  .ai-docs/agent-findings/TEMPLATE.md" rule — in `api-tester`, `ai-developer`, `ai-reviewer`,
  `cli-reviewer`, `infra-reviewer`, and `api-pm`.
- A domain-scope exclusion reading "Git commands that modify the staging area or working tree (per
  CLAUDE.md)" — in `api-tester`'s `identity.md`, citing a file the installing project does not have.

Built-in agents compile into whatever project runs `agents-inc`. In that project there is no
`.ai-docs/agent-findings/` directory and no `TEMPLATE.md`, so a compiled `api-tester` told to write a
finding either creates an orphan directory the project never reads, or reports that it could not
comply. Neither is the behaviour the rule was written for. The `CLAUDE.md` citation is worse in kind:
it points the user's agent at a rule it cannot read and cannot verify.

The four `meta/` agents (`convention-keeper`, `codex-keeper`, `skill-summoner`, `agent-summoner`) also
name `.ai-docs/` paths, but for them it is arguable rather than wrong — curating an `.ai-docs/` tree
is what those agents are for, and a user adopting them plausibly adopts the convention with them. The
six agents above have no such justification: the instruction is orthogonal to what they do.

This is invisible in-repo because every path resolves correctly here. It only fails after
publication, in someone else's project, where nobody reports it back.

## Fix Applied

None to the existing partials — out of scope for the task that surfaced this (create
`src/agents/tester/ai-tester/` only).

The new `ai-tester` agent deliberately omits both the findings instruction and the `CLAUDE.md`
citation, so its partials are project-agnostic throughout. Recording that here matters: without this
finding, the next audit comparing `ai-tester` against its `api-tester` sibling sees a missing rule and
"fixes" it by adding the repo-internal path back.

## Proposed Standard

Add to `.ai-docs/standards/prompt-bible.md`, as a subsection of §8 (Multi-Agent Delegation) or a new
short section on built-in agent authoring:

> **Built-in agent partials are product content, not repository content.** Everything under
> `src/agents/**` compiles into end users' projects. A partial may not name a path, file, or
> convention that exists only in this repository — `.ai-docs/**`, `CLAUDE.md`, `todo/**`,
> `agents-inc`-specific commands. Delegation boilerplate that belongs to _our_ workflow (the findings
> protocol, the git-staging prohibition as "per CLAUDE.md") belongs in the delegating prompt, not in
> the compiled agent.
>
> Two exceptions, both narrow: the `meta/` agents whose stated job is curating an `.ai-docs/` tree,
> and rules restated in project-agnostic terms — "never run git commands that modify the staging area
> or working tree" is fine, "(per CLAUDE.md)" is not.

A one-line check makes it enforceable:
`grep -rn "ai-docs\|CLAUDE\.md\|agents-inc" src/agents/ --exclude-dir=meta` should return nothing.
That grep is cheap enough to run in the same pass as any other agent audit.
