---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/src/stores/config-store.ts
  - apps/editor/src/features/configure/lib/default-assignments.ts
  - apps/editor/src/features/configure/lib/seed.ts
  - packages/cli/src/cli/lib/seed/config-to-seed.ts
standards_docs: []
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  The editor store decides at the moment a skill or row goes: a sub-agent left
  without a live skill loses its pin unless the selection's stack declares it
  (stackAgentIds) or a project's link holds it (agentPinRefusal). Specs open
  links the CLI minted (cliMintedPayload, projectMintedPayload) in
  config-store.test.ts and agent-switch-toasts.spec.ts.
---

## What Was Wrong

The editor's "a stack's sub-agents stay on with no skills" rule was built on the
sub-agent pin (`agents[id].on`), and nothing in the pin records who set it. The
census of pin writes, excluding tests (run 2026-10-22):

```
grep -rnE "on: true|on: !|\bon: agent\.on|on: entry\.on|\{ on:|on: false" \
  apps/editor/src packages/cli/src/cli/lib/seed packages/compile/src \
  --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

plus `toggleAgentPin` in `config-store.ts` (`{ ...state.agents[agentId], on }`,
which the pattern misses) — four sources: a stack (`stackAgentPins`), a click
(`toggleAgentPin`), a link (`fromSeedAgent`) and the unknown-skill rescue
(`keepingAgentsOn`). `toSeedAgent` in `config-to-seed.ts` writes `on: true` for
every installed sub-agent, so every link `share`, `edit --ui` or a bare `edit`
mints arrives with every sub-agent pinned, and the stack rule held there too:
deselecting a sub-agent's last skill on such a link left it on with no toast.
Every editor spec of the rule was green, because none opened a link the CLI
minted; every pin they reached was one the editor had set itself.

## Fix Applied

The rule no longer reads the pin's source from the pin. When a deselection, a
roster row or an options cell leaves a pinned sub-agent without a live skill,
the store drops the pin (dropped, not pinned off, so the skill coming back
brings the sub-agent back) unless the selection's stack declares it or a
project's link holds it. No change to the CLI, so no link id moved.

## Proposed Standard

A rule in the editor that reads `agents[id].on` is specced against a link the
CLI minted (`cliMintedPayload` or `projectMintedPayload` from
`@workspace/api-mocks/fixtures`) as well as against picks made in the editor,
because the CLI is the one writer that pins every sub-agent. Home: the editor's
`e2e/README.md`, beside the fixtures it names. Checked against both `CLAUDE.md`
files: no conflict.
