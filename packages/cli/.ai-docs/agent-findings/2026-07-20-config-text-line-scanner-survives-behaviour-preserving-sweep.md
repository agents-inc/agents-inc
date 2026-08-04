---
type: convention-drift
severity: medium
affected_files:
  - e2e/lifecycle/scope-toggle-combined.e2e.test.ts
  - e2e/interactive/edit-wizard-dual-scope-indicator.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: scope-discipline-deferred
status: open
---

## What Was Wrong

Two CLAUDE.md violations survive in spec files that were otherwise swept during the
Pass 8 Cluster G shared-infra adoption. Both are un-fixable by a strictly
behaviour-preserving pass, so they need a follow-up that is explicitly allowed to
change assertions.

**1. Raw line-scanner over `config.ts` text.**
`scope-toggle-combined.e2e.test.ts`, in the test
"Inert skill scope toggle on a locked dual-scope pair alongside a working agent G->P",
picks data out of config.ts by splitting and filtering the raw file text:

```ts
const honoProjectLines = projectConfig
  .split("\n")
  .filter((l: string) => l.includes("api-framework-hono") && l.includes('"scope":"project"'));
expect(honoProjectLines.length).toBeGreaterThan(0);
```

CLAUDE.md bans loops/regex scans that extract data out of config text, and requires a
structural load instead (`loadProjectConfigFromDir`, or now `loadConfigOrFail` /
`readSkillEntries`). The correct structural form —
`readSkillEntries(projectDir, "api-framework-hono")` filtered on `scope === "project"` —
asserts something genuinely different from "a physical line in the emitted file happens
to contain both substrings". Swapping it is therefore an assertion change, not an
adoption, and was out of scope for this pass.

Note this scanner is also weaker than it looks: it depends on the config writer keeping
a skill entry's `id` and `scope` on the same emitted line. A formatting change in the
config writer would break it without any behavioural regression.

**2. Task ID in an inline test comment.**
`edit-wizard-dual-scope-indicator.e2e.test.ts` carries
`// This state is already correct on \`main\` (config writer is D-221-clean).` inside a
test body. CLAUDE.md permits task IDs in file-level JSDoc only — never in inline
comments — because they look authoritative but go stale the moment the task closes.
(The same file's header JSDoc references D-223, which is the sanctioned location.)

## Fix Applied

None — discovery only. Both sites were deliberately left untouched:

- The line scanner cannot be replaced without changing what the test asserts, which the
  Pass 8 Cluster G phase-2 contract forbids ("Never change what any test asserts").
- The comment is not covered by any adoption rule (R1–R18) in that contract, and editing
  comments outside the adoption surface would widen a narrow, concurrent, multi-agent diff.

Everything else in both files was adopted (`TERMINAL_SIZE.TALL`, `TIMEOUTS.SETUP_DUAL`,
`configTsPath`/`skillsPath`/`agentsPath`, `E2E_SKILL`, `E2E_AGENT_DISPLAY`,
`readSkillBadgesViaEdit`).

## Proposed Standard

1. Add an explicit entry to `.ai-docs/standards/e2e/anti-patterns.md` under the
   config-assertion section: **"Never `split('\n')` or `.includes()` over raw config.ts
   text to prove an entry exists."** Show the structural replacement
   (`readSkillEntries(dir, skillId)` / `loadConfigOrFail(dir)`) beside the banned form,
   and state the reason in behavioural terms: a line-based scan couples the test to the
   config writer's line breaking, so a pure formatting change reads as a product
   regression. Reading raw config text with `toContain` for a _single_ token
   (e.g. `'"excluded":true'`) stays acceptable — the ban is on split/loop/filter
   extraction, matching the CLAUDE.md wording.

2. When a behaviour-preserving sweep is scoped, pair it with an explicit
   **"assertion-affecting follow-up"** list in the ledger. Both items above were visible
   during the sweep but had nowhere to land, and would have been silently dropped if the
   findings instruction had not been in the agent prompt. The ledger entry for Cluster G
   should carry these two sites forward.
