---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/plugins/plugin-info.ts
  - src/cli/lib/plugins/plugin-info.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-07-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: 'Inverted relative to the enum''s documented direction — the CODE side landed and the DOCS side did not. Landed (verified 2026-07-30): `InstallationInfo.agentDirs` is `string[]`, populated only from scopes that actually hold agents (`agentDirCounts.filter(hasEntries)`), and `formatInstallationDisplay` emits one `Agents:` line per surviving dir — so a count and a path can no longer disagree. Pending: (a) the proposed standard — CLAUDE.md''s "Scope Awareness" section has neither the "never report a single path for scope-split artifacts" bullet nor the "never carry a single agentsDir/skillsDir on a display type" bullet, so reporting code remains uncovered while writing code is covered; (b) the follow-up — `InstallationInfo.skillsDir` is still a single project-scoped `string` carrying the identical latent defect, still written and still unread outside tests.'
---

## What Was Wrong

`InstallationInfo` carried a single `agentsDir: string`, copied straight from
`Installation.agentsDir`, which is always `<projectDir>/.claude/agents`. The
`list` command printed that value as the "Agents:" path line.

Compiled agents are split by scope: global-scoped agents land under
`<HOME>/.claude/agents`, project-scoped ones under `<projectDir>/.claude/agents`.
After a default (all-global) install driven from a project directory, every agent
is under HOME and the project agents directory is empty — but `list` named the
project directory. The counts had already been fixed to sum both scopes, so the
output claimed "Agents: 9" directly above a path that held zero agents.

This is the same defect class as two earlier fixes in this area: the init success
report naming the project skills/agents directory for a global install, and
`getInstallationInfo` counting only the project scope. Three separate symptoms,
one cause: a scope-split artifact described by a single, scope-blind path or
count derived from `projectDir`.

The existing CLAUDE.md rules cover _writing_ ("ALWAYS split skill lists by scope
before any path-dependent operation", "ALWAYS use `resolveInstallPaths(projectDir,
scope)`"). Nothing covers _reporting_, so scope-blind display code kept passing
review.

## Fix Applied

- `InstallationInfo.agentsDir: string` → `agentDirs: string[]`, populated only
  with directories that actually contain compiled agents.
- Agent counting now returns `{ dir, count }` per scope; the total and the
  reported directories come from the same read, so a count and a path can never
  disagree.
- `formatInstallationDisplay` emits one `Agents:  <dir>` line per non-empty
  scope, mirroring the shape the init success report already uses (global first,
  then project, empty scopes omitted).
- Unit tests cover all-global, all-project, mixed-scope, home-root and
  no-agents-anywhere; each asserts the exact reported directory list.

Audited alongside it: the `Config:` line was already correct — `configPath` comes
from the installation that was actually detected (project config if present,
otherwise the home one), verified by hand for both cases. No skills path line is
printed, so nothing to fix there. `InstallationInfo.skillsDir` survives as a
project-scoped single value but is dead (written, never read outside tests) — see
below.

## Proposed Standard

Add to CLAUDE.md under "Scope Awareness (project vs global)":

- NEVER report a single path for artifacts that are split by scope. If a command
  prints where skills or agents live, derive the paths from the same scope-aware
  read that produced the counts, and print one block per non-empty scope (global
  first, then project) — see `reportAgentsCompiled` in `src/cli/commands/init.tsx`
  and `formatInstallationDisplay` in `src/cli/lib/plugins/plugin-info.ts`.
- NEVER carry a single `agentsDir`/`skillsDir` on a display/report type. Model it
  as the list of directories that actually hold content, so an empty scope is
  structurally unrepresentable in the output.

Follow-up (not done here, outside this task's file ownership):
`InstallationInfo.skillsDir` is unused in production code and holds a
project-scoped path with the identical latent defect. It should either be removed
or converted to `skillsDirs: string[]` before a consumer starts trusting it.
