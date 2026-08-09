---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/commands/doctor.ts
  - src/cli/lib/operations/project/detect-project.ts
standards_docs:
  - .ai-docs/reference/features/configuration.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`doctor` reports a `.claude-src/config.ts` that exists but cannot be parsed as **`not found`**, and
tells the user to run `init` to create one. The file is right there on disk.

Verified by hand against the real binary (`dist/index.js`) on a project whose only defect is a
one-line syntax error in `config.ts`:

```
  Operational checks
    Config Valid        ✗  .claude-src/config.ts not found
                           Run 'npx agents-inc init' to create a configuration
```

The route: `Doctor.runOperationalChecks` calls `detectProject(projectDir)`, which catches
`ConfigLoadError` and returns `null` — deliberately, so `doctor` reports a config problem instead of
crashing. `runAllChecks` then passes that `null` to `checkConfigValid`, whose first branch is
`if (!config)` and whose message is hardcoded to `${CONFIG_TS_REL} not found`. The three-state load
contract (`absent` / `loads` / `throws`, documented in `reference/features/configuration.md`) is
collapsed back to two states at exactly the surface whose job is to name the state.

`isUninstalledSourceRepo` already knows the difference and says so in its own JSDoc — "A config file
that exists but failed to load also detects as 'no project', and that is a finding rather than an
absence" — so the distinction survives one call and is lost at the next.

Two consequences, both visible in the run above:

1. **The advice is wrong.** `init` does not clear an unreadable config; `uninstall` does. A user who
   follows the tip gets refused (or, before D-69, got a raw `ConfigLoadError`).
2. **The reason is unreadable but not absent from the output.** The parse error appears four times
   in the same run as unstructured `Failed to load project source config at …` lines emitted by
   `loadProjectSourceConfig`'s own `warn`, interleaved with the check rows. The information the
   finding needs is on screen; it is simply not the finding.

This is why D-69's `edit` / `init` refusal does **not** point the user at `doctor`. Sending someone
from "this config cannot be read, recreate it" to a command that answers "not found — run init"
would contradict the message that sent them. The pointer becomes correct the moment `doctor` reports
the parse failure as its own finding; until then it is a loop.

## Fix Applied

None — discovery only. D-69's scope is `edit` (plus the small `init` alignment), and the fix here is
a `doctor` behaviour change with its own e2e expectations: `checkConfigValid` would need the load
outcome rather than a post-`null` config, which means `detectProject` (or a sibling probe) has to
carry the `ConfigLoadError` to it instead of swallowing it. That is a follow-up row, not a
side-effect of this one.

What D-69 did land is the contrast that makes the gap legible: `BaseCommand.ensureConfigReadable`
distinguishes the two states in `edit` and `init`, so the CLI now answers the same question two
different ways depending on which command is asked.

## Proposed Standard

**Where:** `.ai-docs/reference/features/configuration.md` → "Config Load Outcomes — Three States,
Not Two", as a rule extending the existing table.

> A surface that REPORTS on a config must distinguish all three load outcomes. Collapsing `throws`
> into `absent` is already banned for callers that ACT on a config (the note above the table:
> `compile` rebuilding every built-in agent); the same collapse in a reporting surface produces a
> message that is simply false, and — where the report also carries a remedy — sends the user to a
> command that cannot apply. A caller that catches `ConfigLoadError` and returns `null` owes its
> consumers a way to tell that `null` apart from a missing file.

The concrete enforcement is a `doctor` e2e case in the shape of `e2e/commands/compile-corrupt-config.e2e.test.ts`
and `e2e/commands/edit-corrupt-config.e2e.test.ts`: a project whose config exists and is corrupt,
asserting the `Config Valid` row does NOT read `not found`. No such case exists today —
`doctor-diagnostics.e2e.test.ts` and `doctor-blind-spots.e2e.test.ts` cover missing and invalid-shape
configs, neither of which reaches this branch.
