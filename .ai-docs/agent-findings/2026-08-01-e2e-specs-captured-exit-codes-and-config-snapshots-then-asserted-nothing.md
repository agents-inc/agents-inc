---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/doctor-dual-scope.e2e.test.ts
  - e2e/lifecycle/scope-toggle-config-snapshot.e2e.test.ts
  - e2e/lifecycle/scope-toggle-roundtrip.e2e.test.ts
  - e2e/commands/plugin-uninstall-edge-cases.e2e.test.ts
  - e2e/integration/custom-agents.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - CLAUDE.md
date: 2026-08-01
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >
  Code side landed: eight assertions added across five spec files, all green, none invented.
  Pending: the E2E-specific shape of the rule (a snapshot taken and never compared; an
  assertion helper imported and never called) is not written into
  .ai-docs/standards/e2e/anti-patterns.md, which is where an E2E author looks. The sibling
  finding proposed the general rule for CLAUDE.md and it is still unwritten there too.
---

## What Was Wrong

Turning on the unused-variable lint rule over `e2e/` for the first time produced 15 reports. The
sibling finding
(`2026-08-01-unused-bindings-in-tests-mark-assertions-that-were-planned-but-never-written.md`)
established the general principle from the `src/` half of the same sweep: **in a test, an unused
variable usually marks the spot where an assertion was planned and never written.** This finding
records what that principle turned up on the E2E side, because two of the shapes it found do not
appear in `src/` at all and would not be recognised from the sibling's description.

**Shape A — a "before" snapshot that is never compared to an "after".** Four of the fifteen. A
lifecycle spec opens with a comment reading `// BEFORE: Snapshot both configs`, reads both
`config.ts` files into variables, does the wizard work, and then reads only one of them back. The
other snapshot is dead. This is the most dangerous shape in the set because the surviving
assertions look thorough:

- `scope-toggle-config-snapshot.e2e.test.ts`, the agent global→project toggle, snapshotted BOTH
  configs and compared NEITHER. Its two "after" assertions were
  `expect(projectConfigAfter).toContain("web-developer")` and
  `expect(globalConfigAfter).toContain("web-developer")` — and the setup fixture already writes
  `web-developer` into both files before the toggle runs. **Both assertions were true before the
  wizard ever started.** The spec was capable of passing with the toggle keystroke silently
  swallowed, which is a documented failure mode of this suite (see the page-object key-press rule
  in `.ai-docs/standards/e2e/README.md`).
- `scope-toggle-roundtrip.e2e.test.ts`, "Passthrough edit should not change scope of any skill or
  agent", asserted the global config was unchanged and dropped the project one — in a spec whose
  session runs at PROJECT scope, i.e. it checked the file the edit was least likely to touch and
  skipped the file it was most likely to touch.

**Shape B — an assertion helper imported and never called.** `plugin-uninstall-edge-cases.e2e.test.ts`
imported `expectCleanUninstall` and never invoked it. Its "should also remove config by default"
spec checked only that the config directory was gone. The word "also" in the name claims the skills
and agents went too, and nothing verified that; a leftover skill directory would have survived
unnoticed. `expectCleanUninstall` is precisely the helper
`.ai-docs/standards/e2e/anti-patterns.md` § "Never omit negative assertions after removals" tells
you to reach for, so the unused import was the fingerprint of an author who knew the rule and got
interrupted.

**Shape C — a captured exit code, never asserted.** Three of the fifteen, and in one case the spec's
own comment stated the missing assertion in prose: `doctor-dual-scope.e2e.test.ts` said "the
important thing is doctor runs without crashing on the extra directory" and then asserted only a
regex over the output. `cc doctor` exits non-zero when any check reports `fail`, so "runs without
crashing" has an exact, checkable form the spec had already written down in English.

## Fix Applied

All 15 unused-variable reports resolved. No `eslint-disable` for any of them, no spec deleted, no
assertion weakened. Eight assertions added, every one derived from something already present — the
spec's own name, its own comment, or a sibling spec in the same file — and every one verified green
by running its file.

| File                                       | Added                                                      | Derived from                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `doctor-dual-scope` (missing agent)        | `exitCode === SUCCESS`                                     | `checkAgentsCompiled` returns `status: "warn"`; doctor only exits non-zero on `fail`         |
| `doctor-dual-scope` (orphan skill)         | `exitCode === SUCCESS`                                     | the spec's own comment, "runs without crashing on the extra directory"                       |
| `scope-toggle-config-snapshot` (G→P skill) | project config changed                                     | the sibling spec in the same file already asserts exactly this                               |
| `scope-toggle-config-snapshot` (G→P agent) | project config changed; global config byte-identical       | the spec name says "preserve global"; sibling spec asserts the same invariant                |
| `scope-toggle-roundtrip` (passthrough)     | project config functionally identical                      | mirrors the global assertion three lines above, same normalizer                              |
| `plugin-uninstall-edge-cases`              | `expectCleanUninstall(projectDir, { removeConfig: true })` | the import that was already there                                                            |
| `custom-agents` (missing playbook)         | `exitCode === SUCCESS`                                     | "gracefully" in the spec name; `recompileAgents` records per-agent failures without aborting |

Seven bindings were genuinely dead and removed: a write-only `e2eSourceDir` assigned in five
`it.fails` specs, a `projectDir` in a describe block that runs entirely at global scope, two
`stdout` destructures shadowed by a `combined` the specs actually assert on, an `EXIT_CODES` import
in a spec that aborts inside a `finally`, and an `AgentScopeConfig` type import.

## Left For The Owner

`dual-scope-in-session-collapse-restore-sequence.e2e.test.ts` imported `EXIT_CODES` and never used
it. Its wizard is aborted inside a `finally` block, so an exit-code assertion there would fire
during unwinding and mask whatever failed in the `try`. The nearest sibling,
`dual-scope-s-round-trip-space-inert.e2e.test.ts`, has the identical shape and also does not import
or assert it, so the import reads as copy-paste rather than intent, and I removed it rather than
force an assertion into the wrong place. **If aborted sessions are meant to be pinned to
`EXIT_CODES.CANCELLED`** — `sources-step-duplicate-marketplace-column.e2e.test.ts` does exactly
that, from outside a `finally` — then that is a suite-wide gap covering every one of the fourteen
`abortAndDestroy` call sites, not a one-file fix, and it needs the abort moved out of `finally`
first.

## Proposed Standard

The sibling finding proposes the general rule for CLAUDE.md § "Test Assertions". Add these two
E2E-specific forms to `.ai-docs/standards/e2e/anti-patterns.md` § "Weak Assertions", where an E2E
author will actually look:

> **Never take a "before" snapshot you do not compare against.** A `const configBefore = await
readTestFile(...)` is a promise that an `expect(configAfter)...` follows. If a spec snapshots two
> files it must assert on two files: the one that should have changed (`.not.toBe(before)`, the
> proof the keystroke landed) and the one that should not (`.toBe(before)`). Asserting only
> `toContain("<name>")` on the after-state is not a substitute — in a dual-scope fixture the name
> is usually present in both configs before the wizard runs, so the assertion is true of the
> pre-state and the spec passes with the interaction swallowed.

> **Never leave an assertion helper imported but uncalled.** `expectCleanUninstall`,
> `expectFullInstallation`, `expectDualScopeInstallation` and `expectPhaseSuccess` exist because the
> hand-rolled subset a spec writes instead is always narrower. An unused import from
> `e2e/assertions/` means the spec is verifying less than its name claims — call it or explain in
> the file JSDoc why the narrower check is deliberate.
