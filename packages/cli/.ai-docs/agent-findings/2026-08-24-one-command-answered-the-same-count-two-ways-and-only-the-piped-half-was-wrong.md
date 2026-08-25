---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/commands/list.tsx
  - src/cli/commands/init.tsx
  - src/cli/lib/plugins/plugin-info.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-24
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  `getInstallationInfo` in `src/cli/lib/plugins/plugin-info.ts` takes its skill count from one
  private `countManagedSkills`, which counts the non-excluded entries of the loaded config's
  skills deduplicated by id and consults the install mode nowhere. The four counting helpers
  the body names went with it, so the piped branch and the dashboard now answer from the
  configuration the interactive branch already read. The specs the body names pass.
---

## What Was Wrong

`list` answers "which skills does this installation have" **twice, from two different sources**,
and the branch a person sees was right while the branch a script sees was wrong.

`run()` in `src/cli/commands/list.tsx` branches on `process.stdin.isTTY`:

- **Interactive.** It loads the project config, filters `config.skills` on `!s.excluded`, and hands
  the result to `ListView` / `SkillAgentSummary`. That is the configuration's own roster with its
  tombstones removed — the answer the owner ruled correct on 2026-08-24 (CLI-823).
- **Piped, or config-less.** It calls `getInstallationInfo()` and prints
  `formatInstallationDisplay(info)`. `countInstalledSkills` in `src/cli/lib/plugins/plugin-info.ts`
  asks the plugin registry when `installation.mode === "plugin"` and counts directories under
  `.claude/skills/` otherwise — neither of which is the configuration.

So the same command, in one release, both implemented the ruled behaviour and contradicted it, and
the two halves were never compared. The `mixed` mode fell through the `"plugin"` test into the
directory-counting branch, which for a mostly-plugin install counts close to nothing: the reported
reproduction printed `Skills: 2` over a configuration declaring eleven, one of the two being a
`context7-mcp` directory the configuration never named.

The dashboard reads the same wrong producer (`info?.skillCount` in `getDashboardData`,
`src/cli/commands/init.tsx`), so the defect reached two of the three surfaces and the third one
sitting eleven lines above it in the same file was already right.

Derivation, both branches in one read:

```
grep -n 'isTTY' -A 12 src/cli/commands/list.tsx
grep -n 'countInstalledSkills' -A 12 src/cli/lib/plugins/plugin-info.ts
```

The class is already on the record once. `todo/archive.md` under `2026-08-24 — CLI-816` records the
two dashboard paths having diverged for the same reason — each was only ever compared against
itself — and the fix there was to give them one producer (`dashboardCountLines`). What that fix did
not do is ask the same question of `list`, which had the identical shape and still has it.

## Fix Applied

None — failing tests only. Fourteen red specs now pin the ruled behaviour:
`src/cli/lib/plugins/plugin-info.test.ts` (seven, at the producer),
`src/cli/lib/__tests__/commands/init.test.ts` (three, holding the dashboard and `list` to one
number over one real installation) and `e2e/commands/list.e2e.test.ts` (four, through the built
binary). A later agent implements.

## Proposed Standard

**A command that renders one datum on more than one branch needs a spec that drives both branches
over one fixture.** The existing rules are close and both stop short. `packages/cli/CLAUDE.md`
-> Scope Awareness says never report a single path for artefacts split by scope — a rule about the
scope axis, not about the TTY axis, and this defect is on the TTY axis. The E2E standard's
`assertions.md` -> "Assert the Departure, Not Only the Arrival" is about one surface over time
rather than two surfaces at one moment.

Where the rule should go: `.ai-docs/standards/e2e/assertions.md`, as a section beside the departure
rule, phrased on the mechanism rather than on TTY specifically — **a branch that no spec reaches is
a second implementation nobody is holding to the first one**. `process.stdin.isTTY` is the branch
this repository actually has (`showDashboard` and `List.run` are both on it), and it is the one an
E2E suite is least likely to reach, because every non-interactive runner here pipes by
construction.

The cheap enforcement is narrower than the rule and worth having on its own: a scan for
`isTTY` in `src/cli/commands/**` that requires each such file to be named by at least one spec
driving the command through a PTY **and** one driving it through a pipe. It would have reported
`list.tsx` — the whole E2E suite reaches only the piped branch, and `ListView` has no spec at all.
That claim is a sample, not a census: it was measured on `list` alone.

**Cross-check against CLAUDE.md.** No conflict found. This adds an obligation on specs and asserts
nothing about where product code may branch; the "guards are not features" ruling applies, so the
scan is a proposal for a later scoped pass rather than something to smuggle into a fix.
