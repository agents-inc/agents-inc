---
type: architectural-drift
severity: low
affected_files:
  - src/cli/commands/doctor.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

In `commands/doctor.ts`, `checkNoOrphans` lists both agents folders with one codec,
`agentCodec(providerInUse(projectDir))`, which is the project's. The global folder, though, comes
from `resolveInstallPaths(projectDir, "global")`, and that resolves it with HOME's provider. When
the two scopes are on different providers, the global folder is globbed for the other provider's
extension, so nothing in it is ever listed.

Other rows in the same run read the global scope with its own host. `agentCompileChecks` (Agents
Compiled) does, `unofferablePlacementsFound` in `lib/hosts/configured-placements.ts` does ("each
asked of its OWN host"), and so does the Layout row.

Reproduction: the built bin with an isolated HOME, on 2026-10-21. HOME holds
`.agents-inc/claude/config.ts` and `.claude/agents/{api-developer,stray-global}.md`. The project
holds `.agents-inc/codex/config.ts`, which claims `web-developer` (project scope) and
`api-developer` (global scope). `doctor` printed:

```
    Agents                  ✗  2 agents: 2 errors, 0 warnings
                               - [ERROR] ~/.claude/agents/api-developer.md: ...
                               - [ERROR] ~/.claude/agents/stray-global.md: ...
    Layout                  ✓  The global installation is on .agents-inc/claude/
    Layout                  ✓  This project is on .agents-inc/codex/
    Agents Compiled         !  1 agent needs recompilation
                               - web-developer (missing)
    No Orphans              ✓  No orphaned agent files
```

So the content check and Agents Compiled both read `~/.claude/agents/`, and the orphan row saw
nothing there, including `stray-global.md`.

## Fix Applied

None. This is discovery only, because the obvious fix is unsafe until an owner rules on the model.
Giving each folder its own scope's codec would list the Claude global's agents for a Codex project.
But `e2e/lifecycle/codex-install-leaves-claude-untouched.e2e.test.ts` says "A Codex project relates
only to the Codex global, so it must not register in Claude's". A Codex project's config therefore
normally claims none of those agents, so every one of them would be reported `(not in config)`.
Today's silence is a miss, and that fix would be a false alarm.

## Proposed Standard

An owner ruling, written into `docs/architecture.md` beside the provider model. When a project and
HOME are on different providers, is the project's global scope HOME's installation (as
`resolveInstallPaths` and the Layout row treat it), or the project provider's own global (as the
Codex e2e treats it)? Once that is ruled, `checkNoOrphans` takes one codec per folder, matching
whatever that folder is resolved with.
