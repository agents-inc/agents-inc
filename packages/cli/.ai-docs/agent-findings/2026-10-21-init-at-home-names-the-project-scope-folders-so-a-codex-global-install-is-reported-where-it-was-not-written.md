---
type: convention-drift
severity: medium
affected_files:
  - src/cli/commands/init.tsx
  - src/cli/lib/__tests__/commands/init-from-with-a-provider.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: premise-expired
status: partial
partial_note: >-
  Landed: `skillsCopiedBlocks` and `agentsCompiledBlocks` lost their `isHomeDirectory` branches and
  name the folder of the scope each file was written at, naming a folder both scopes share once; the
  two `it.fails` specs are plain `it` and pass. Pending: the other home-directory special cases
  under Proposed Standard are unverified, and the CLAUDE.md rule is not applied.
---

## What Was Wrong

When `init --from` runs at home, `skillsCopiedBlocks` and `agentsCompiledBlocks` in
`commands/init.tsx` take an `isHomeDirectory` branch. That branch names
`resolveInstallPaths(home, "project")` as the only folder, while the files go to the global scope's
folders. `refuseProjectScopedContentAtHome` has already refused every project-scoped entry, so at
home everything is global. For Claude the two scopes resolve to the same `~/.claude/...` folders at
home, so the branch has no effect. For Codex they do not:

| Folder | Global (where the files go)                  | Project at home (what the block names) |
| ------ | -------------------------------------------- | -------------------------------------- |
| skills | `$CODEX_HOME/skills`, else `~/.codex/skills` | `~/.agents/skills`                     |
| agents | `$CODEX_HOME/agents`, else `~/.codex/agents` | `~/.codex/agents`                      |

The CLAUDE.md rule this breaks is "If a command prints where skills or agents live, derive the paths
from the same scope-aware read that produced the counts". The baseline tree already had the branch,
so it was right for Claude and its premise lapsed when Codex came in.

Reproduction: `init --from <id> --provider codex` with HOME as the cwd, a payload of one global
eject skill and one global agent, run in vitest through `Init.run` with an isolated HOME on
2026-10-21. With `CODEX_HOME` unset the run printed `Copied 1 skill to ~/.codex/skills/`, which is
right and comes from `skillsCopiedLine`. It then printed `Skills copied to:` / `~/.agents/skills`,
a folder that does not exist, while the skill was at `~/.codex/skills/<id>/SKILL.md`. With
`CODEX_HOME=~/codex-home` the skill and `web-developer.toml` landed under `~/codex-home/`, but the
blocks named `~/.agents/skills` and `~/.codex/agents`.

Mutation testing found it. Stryker reported `isHomeDirectory(projectDir) -> false` at both branches
as Survived: removing the branch changes nothing for Claude, and for Codex it makes the output
right.

## Fix Applied

None to product code. This was a test lane. `init-from-with-a-provider.test.ts` now pins the
current behaviour under "at home, installing the global install for Codex". Two `it` specs pin where
the files land. Two `it.fails` specs each pin one block naming that folder, so each `it.fails`
flips by itself when its block is fixed.

## Proposed Standard

The fix: report every block with the scope the files were written at. At home that scope is
`"global"`, so either the `isHomeDirectory` branch goes or it names the global folders. Neither has
been tried here.

Run `grep -rn "isHomeDirectory(" src/cli | grep -v test` to find the other home-directory special
cases. The ones that assume the two scopes share folders at home are candidates for the same
defect, and none was verified in this pass: `compileAgentsAllScopes` (its home branch passes the
project `agentsDir` as `outputDir`, yet the agent landed under `$CODEX_HOME`), `doctor.ts`'s
`scopesShareAgentsDir`, `plugin-info.ts`'s `["project"]` at home, and `discover-skills.ts`'s
`isGlobalProject`. The rule for CLAUDE.md's Scope Awareness section: never assume a provider's
project and global folders coincide at home. Only Claude's do.
