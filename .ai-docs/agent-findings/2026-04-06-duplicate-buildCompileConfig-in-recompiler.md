---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/agents/agent-recompiler.ts
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-06
reporting_agent: orchestrator
category: dry
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: buildCompileConfig deleted; recompiler reuses buildCompileAgents
---

## What Was Wrong

`agent-recompiler.ts` had its own `buildCompileConfig` function that duplicated the core logic of `buildCompileAgents` from `local-installer.ts`. Both functions iterated over agents, checked for existence in `allAgents`, and built `CompileAgentConfig` entries from stack assignments using `buildSkillRefsFromConfig`. The recompiler version lacked the D7 cross-scope safety net (filtering project-scoped skills from global agents) that `buildCompileAgents` provides.

## Fix Applied

Deleted `buildCompileConfig` (plus its two helper types `BuildCompileConfigParams` and `BuildCompileConfigResult`) and replaced the call site with `buildCompileAgents` from `local-installer.ts`. Added a post-call loop to include resolved agents not in `config.agents` (the recompiler resolves agents from options or existing files, not just config) and to emit "not found" warnings for agents missing from source definitions.

Also removed the now-unused `CompileAgentConfig` type import and `buildSkillRefsFromConfig` import.

## Proposed Standard

When a new module needs to build `CompileConfig.agents`, it should reuse `buildCompileAgents` from `local-installer.ts` rather than reimplementing the iteration. Document this in `.ai-docs/standards/clean-code-standards.md` under a "Single source of truth for compile-agent construction" rule.
