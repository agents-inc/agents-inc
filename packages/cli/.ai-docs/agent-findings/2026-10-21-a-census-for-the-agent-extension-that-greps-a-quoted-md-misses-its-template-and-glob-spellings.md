---
type: standard-gap
severity: low
affected_files:
  - src/cli/lib/plugins/plugin-info.ts
  - src/cli/lib/operations/project/remove-compiled-agents.ts
  - src/cli/lib/agents/agent-plugin-compiler.ts
  - src/cli/lib/plugins/plugin-validator.ts
  - src/cli/commands/edit.tsx
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The four lib sites now read agentCodec("claude"). The `${name}.md` in commands/edit.tsx's
  cleanupStaleAgentFiles belonged to another lane and is unchanged.
---

## What Was Wrong

Three censuses have been written for agent file names that spell Claude's `.md` instead of asking
`agentCodec`, and each one misses a spelling:

- A review this round, and the Proposed Standard of
  `2026-10-21-an-agent-count-hard-coded-to-md-reads-every-codex-installation-as-compiled-to-nothing`,
  grep `'"\.md"'`. That misses template literals: `${agentName}.md` in `agent-plugin-compiler.ts`
  and `${name}.md` in `commands/edit.tsx`.
- `2026-10-20-doctor-names-a-codex-orphan-agent-file-with-an-extension-it-does-not-have` greps
  `'\}\.md\b|AGENT_FILE_EXTENSION'`. That misses the glob `"*.md"` in the agents scan of
  `plugin-validator.ts`.

The review named three sites. Before this fix, the union below found five, apart from the owner
`agentCodec` in `install-layout.ts` (a census of non-test `src/cli`).

## Fix Applied

`plugin-info.ts`, `remove-compiled-agents.ts` and `agent-plugin-compiler.ts` now take
`agentCodec("claude").extension`, and `plugin-validator.ts` takes `agentCodec("claude").listGlob`.
The behaviour is the same, and `edit.tsx` belonged to another lane. In `agent-plugin-compiler.ts`
and `plugin-validator.ts`, `"claude"` is the 2026-10-20 finding's "Claude-only by design": both
handle the Claude Code plugin format. In `plugin-info.ts` it is not. `getInstallationInfo` resolves
a provider-aware directory and still counts no `.toml`, so `list`, piped, prints `Agents: 0` on a
Codex project. That is the 2026-10-21 finding's open half, reproduced again on this tree.

## Proposed Standard

Use one census, the union of the three:

```
grep -rnE "\.md['\"\`]|\*\.md" src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -v __tests__ | grep -vE 'SKILL\.md|README\.md'
```

It also returns prose about other files (`compiler.ts`'s `output.md`). Read each hit before acting
on it. Nothing runs this census, so it guards nothing until a gate does. Not in conflict with
`CLAUDE.md`.
