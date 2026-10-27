---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/plugins/plugin-info.ts
  - src/cli/lib/content-validator.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-26
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  `list`'s count is repaired, `doctor`'s Agents content row is not. The row waits on how a Codex
  role file should be validated, since `validateAgentFrontmatter` reads markdown frontmatter.
---

## What Was Wrong

Two reads of a scope's compiled sub-agents named Claude's format whatever provider the folder
belonged to, so a Codex installation's `.toml` role files went uncounted.

- `countCompiledAgentsPerScope` in `lib/plugins/plugin-info.ts` (`list`'s `Agents:` count) globbed
  with `agentCodec("claude")`, so a Codex installation's folders counted 0 (read, not reproduced).
- `validateAgentsDirectory` in `lib/content-validator.ts` (`doctor`'s Agents content row) lists
  with `listAgentMdFiles`, so a Codex installation reads `No agents to validate`.

Found while CLI-984 moved both reads onto the global installation a project inherits: in a Codex
project under a home holding both, they had read the Claude global's `.md` files, which hid it.

Census:

```
grep -rn 'agentCodec("claude")\|listAgentMdFiles(' src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

## Fix Applied

`countCompiledAgentsPerScope` reads each scope's provider (`providerAtScope`) once and takes both
the folder and the extension from it. Hand-run: `list` in a Codex project under a home holding
both prints `Agents:  2`, one global `.toml` and one project `.toml`. Nothing pins it yet. The
doctor row is unrepaired.

## Proposed Standard

Under "Scope Awareness" in `packages/cli/CLAUDE.md`: a read of compiled sub-agents takes the
folder and the agent format from one provider read, never `agentCodec("claude")` or
`listAgentMdFiles` where the installation may be Codex.
