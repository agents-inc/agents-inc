---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/plugins/plugin-info.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-visible
status: partial
partial_note: >-
  The dashboard's per-provider count (getInstallationsByProvider) reads agentCodec(provider). The
  list command's getInstallationInfo still counts AGENT_FILE_EXTENSION (".md") and reads a Codex
  installation's .toml roles as zero; left alone as outside the dashboard card.
---

## What Was Wrong

`plugin-info.ts` counts compiled agents with `AGENT_FILE_EXTENSION = ".md"`. A Codex installation
compiles `.toml` role files, so every count of one read 0 — `list --provider codex` printed
"Agents: 0" beside sixteen role files (the 2026-10-15 journey run's codex D1). `agentCodec(provider)`
in `install-layout.ts` already names each provider's extension; the counter did not ask it.

## Fix Applied

Partial. The dashboard's new per-provider read counts through `agentCodec(provider).extension`, at
each scope's `agentsDir(provider, scope, cwd)`, never through `providerInUse`. `getInstallationInfo`
(read by `list`) is unchanged.

## Proposed Standard

`CLAUDE.md` § Scope Awareness: anything that recognises a compiled agent file asks `agentCodec`
for its extension. Census: `grep -rn '"\.md"' src/cli --include='*.ts' | grep -iv test`.
