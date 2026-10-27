---
type: missing-standard
severity: medium
affected_files:
  - packages/compile/src/seed-to-config.ts
  - packages/cli/src/cli/base-command.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-26
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: premise-expired
status: partial
partial_note: >-
  Code side landed: `refuseUnwritableAssignments` in `seedToInstallSelection` now judges every pair
  the payload names, installable here or not, before the catalogue narrows it, and names loaded and
  skipped pairs in one refusal. The `packages/cli/CLAUDE.md` clause the Proposal asks for is pending.
---

# A refusal of a link's own shape, decided over what loaded, lets a failed load install the link it refuses

## What was observed

A link assigning a project-scoped skill to a sub-agent that rests at global is refused by
`init --from` and `edit --from` ("these assignments have nowhere to be written"). When that skill's
`metadata.yaml` will not load, the same link installs: `init --from` exits 0 and writes the
sub-agent to `~/.claude/agents/`, and `edit --from` offers it under "Global" and writes it there on
a yes. The only word said is the skip warning. Reproduced by hand on 2026-10-26 against a fresh
build (control: the same link with the skill loading is refused at both doors; the same failed
load with the sub-agent pinned to the project installs into the project).

## Why

`seedToInstallSelection` (`packages/compile/src/seed-to-config.ts`) builds its assignment rows
from `installable` skills only, then `refuseUnwritableAssignments(rows)`. A skipped skill makes no
row, so its pairs are never judged. `refuseUnwritableStack` in `refuseSharedConfigBeforeAsking`
(`packages/cli/src/cli/base-command.ts`) judges `assignedStack`, the same subset.

The docblock's premise was right when written: "an unwritable pair is the one fatal case: nothing
downstream filters `assignedStack`" — a skipped skill's pairs reached nothing. The change that
installs a sub-agent without a skill that fails to load (CLI-915) made a skipped skill's sub-agents
reach the install, and nothing re-asked which refusals had been decided over the narrowed set.

The user docs (`apps/www/src/content/docs/docs/reference/commands.md`, `init --from`) say, unconditionally: "A payload that assigns a project-scoped skill to a sub-agent
resting at global scope … is refused with every such pair named, so a single re-share … can fix
them all." Today a link holding one loading pair and one failed-load pair names only the first.

## Census

The refusals run over a decoded selection (`refuseSharedConfigBeforeAsking`,
`refuseProjectScopedContentAtHome`). Only the unwritable pair has a consequence when a skill is
skipped, because only it concerns a sub-agent the skip still installs. The placement, stack,
carried-destination and home refusals concern the skipped skill itself, which installs nothing.

## Proposal

One clause beside the pairing rule in `packages/cli/CLAUDE.md`: a refusal of the link's own shape
is decided over the link, before the catalogue narrows it; and a `--from` refusal's control
includes a failed load. The reds in `packages/compile/src/seed-to-config.test.ts` ("a shared
configuration with nowhere to write an assignment") and
`packages/cli/e2e/interactive/from-refuses-an-unwritable-pair-whether-its-skill-loads.e2e.test.ts`
hold the instance. Discovery only.
