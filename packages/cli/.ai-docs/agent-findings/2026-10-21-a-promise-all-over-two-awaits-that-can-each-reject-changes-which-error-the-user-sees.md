---
type: standard-gap
severity: low
affected_files:
  - src/cli/lib/compiler.ts
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/agents/agent-recompiler.ts
  - src/cli/lib/operations/project/detect-both-installations.ts
  - src/cli/lib/operations/skills/discover-skills.ts
  - src/cli/lib/plugins/plugin-validator.ts
  - src/cli/lib/source-validator.ts
  - src/cli/lib/plugins/plugin-info.ts
  - src/cli/lib/content-validator.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

The expressive-ts skill's Pattern 7 says sequential `await` on independent operations is a hidden
performance bug and should become `Promise.all`. On reads that is behaviour-preserving only under
two conditions, and nothing in the repository states either:

1. **At most one member can reject.** Sequentially, the first await's rejection always wins.
   `Promise.all` rejects with whichever rejection lands first in time, so when both can fail the
   error the user sees depends on timing. Example: `buildInstallConfig` awaits `loadSelectedStack`,
   which throws "stack not offered", then `loadProjectConfig`, which throws `ConfigLoadError`. Run
   them together and an unoffered stack id in a project with a corrupt config could surface either
   message.
2. **No member logs.** `verbose`/`warn` lines from concurrent members interleave, and the order is
   visible on stderr. `discoverInstalledSkills` is the clear case: four scans, each logging a count,
   and the two local-skill scans warning per unusable skill.

The companion finding
`2026-10-21-a-config-pairs-sequential-writes-keep-it-agreeing-on-failure-and-read-as-a-missed-promise-all`
covers writes, where the order keeps an artefact consistent on failure. This finding covers reads,
where the order decides which failure is reported.

Census: these are the sequential independent-await sites read in the X4-lib-rest expressive-ts
round 1 lane (a sample of `src/cli/lib`, not the whole tree). Left sequential because both members
can reject: `readAgentFiles` (`identity.md`, `playbook.md`), `buildInstallConfig`,
`recompileAgents` (config, built-in and project agent loads), `detectBothInstallations`,
`validatePlugin`'s skills/agents pair, `validateEachPlugin`, and `pairSkillFiles`'s two globs
(`fast-glob` is not given `suppressErrors`). Left sequential because members log:
`discoverInstalledSkills`. Converted because at most one member can reject and none logs:
`getInstallationInfo` (only `loadProjectConfig` can reject; `countDirEntries` catches everything),
`validateInstalledSkill` (`readSkillMetadata` catches its own read errors), and `validatePlugin`'s
manifest pair (both members catch).

## Fix Applied

None to the rule — discovery only. The three safe sites were converted in the same round.

## Proposed Standard

`clean-code-standards.md` should state the read-side test beside the write-side one: two independent
reads may share a `Promise.all` only when at most one can reject and neither logs. Otherwise they
stay sequential, and the first await is the error the user sees.

Hardening: one spec per double-failure site that makes both members fail with distinct errors, the
first one's rejection deliberately later than the second's, and asserts the first one's message.
The delay is what makes it deterministic: on real files both failures land in the same tick or so,
and a spec without it reddens under `Promise.all` only when the second member wins the race.
`buildInstallConfig` is the natural first one (a stack lookup that rejects after a delay, plus a
config load that rejects at once, expecting the stack message). Nothing in the suites holds any of
these sites today. This does not conflict with CLAUDE.md, which says nothing about await ordering on
reads.
