---
type: audit
severity: low
affected_files:
  - e2e/lifecycle/claude-install-byte-identity.e2e.test.ts
  - e2e/fixtures/claude-golden-trees/dual-scope-edit-compile-uninstall.json
  - e2e/fixtures/claude-golden-trees/global-eject.json
  - e2e/fixtures/claude-golden-trees/project-plugin.json
standards_docs:
  - docs/briefing.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: convention-undocumented
status: open
---

## What Was Wrong

A brief changing the four tester prompts asked for the golden install trees to be re-recorded. They
hold no tester. Every phase of every golden compiles `web-developer` and `api-developer` and nothing
else, so a change to any other agent's partials leaves them byte-identical, and
`claude-install-byte-identity` passed with no `-u` run. Census (all phases, all three files):

```
grep -ho '"[^"]*\.claude/agents/[a-z-]*\.md"' e2e/fixtures/claude-golden-trees/*.json | sort -u
```

A golden changes when a partial of those two agents changes, or when the shared template or
methodology does (`src/agents/_templates/`).

## Fix Applied

None, discovery only. The tester instruction is pinned instead by
`e2e/commands/compile-tells-each-sub-agent-that-writes-code-to-run-the-typecheck.e2e.test.ts`.

## Proposed Standard

No document change. The spec's subject guards already name the two agents, and a doc sentence would
be a second copy of a fact that moves with the E2E stack. Before asking for a re-record, a brief that
changes agent partials runs the census above and asks only when the changed agent is in it, or the
change is under `_templates/`.

This does not conflict with any CLAUDE.md rule.
