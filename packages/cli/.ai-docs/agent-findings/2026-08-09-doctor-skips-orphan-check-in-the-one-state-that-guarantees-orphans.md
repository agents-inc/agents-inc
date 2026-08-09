---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/commands/doctor.ts
  - e2e/lifecycle/global-config-deleted-under-install.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-08-09
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: missing-rule
status: resolved
resolved_by:
  CLI-468 — the No Orphans row fires when the config is ABSENT, naming every installed skill
  directory and compiled agent file from the content layer's own walk (`listInstalledArtifacts`),
  as an error with a tip that names what `init` and `uninstall` each do about the leftovers.
  Candidate 1 of the two below, with candidate 2's naming folded into the row rather than the
  config verdict. The skip stands for an absent config with nothing installed, and for a config
  that loads and fails validation.
---

## What Was Wrong

Delete `~/.claude-src/config.ts` from a real global install and run `doctor`. The report says, in one
pass:

```
  Content checks
    Skills              ✓  7 skills validated
    Agents              ✓  2 agents validated

  Operational checks
    Config Valid        ✗  .claude-src/config.ts not found
    No Orphans          -  Skipped (config invalid)
```

`checkNoOrphans` takes the config as its first parameter, so `runAllChecks` substitutes
`skippedResult("orphans")` whenever the config is `null`:

```ts
const orphansResult = config
  ? await safeCheck("orphans", () => checkNoOrphans(config, projectDir))
  : skippedResult("orphans");
```

The orphan row exists to answer "which installed files does no configuration declare?". With no
configuration, the answer is _all of them_ — seven ejected skill directories and two compiled agent
files, which the content layer counted four lines earlier. So the one check whose purpose is
naming unowned files is skipped in the one state where every installed file is guaranteed to
qualify, and the user is told the row was skipped rather than that their installation is stranded.

The skip is not wrong for the other `null`-config states it also covers (an empty directory has no
files to orphan), which is presumably why it reads as safe. What makes this state different is
that content is present: the same run has already proved there are files to talk about.

The remedy the report does print — `Run 'npx agents-inc init' to create a configuration` — sends
the user into the from-scratch wizard without telling them seven skills and two agents will still
be on disk when they get there.

## Fix Applied

At discovery: none — the gap was pinned instead, as an `it.fails` in
`e2e/lifecycle/global-config-deleted-under-install` ("reports the stranded skills and agents as
orphans") carrying a KNOWN GAP comment pointing here.

Closed by CLI-468 (2026-08-09). `runAllChecks` now asks `resolveOrphansCheck`, which reads the
`ConfigState` rather than the nullable config: an ABSENT config runs `checkUnownedInstallation`
instead of skipping. That check calls `listInstalledArtifacts` — the same two walks
`validateInstalledSkills` and `validateInstalledAgents` count four rows above — and reports every
skill directory and compiled agent file by display path, as a `fail` under the new
`orphans-unowned` kind. That kind exists so the row can carry its own tip, the same way CLI-435
gave the empty config `config-empty`.

The verdict is an error, not a warning, on the evidence in doctor's own table: every warning there
names something a command repairs (a stray agent file is pruned by the next `compile`, a missing
skill re-ejected), and nothing repairs this — `compile` and `edit` refuse without a config, and
`uninstall` clears the skill directories by their `forked-from` metadata while leaving compiled
agents it can no longer identify. The tip says exactly that, because sending a reader to `init`
without it is what the last section of this finding objected to.

The skip stands where it was never wrong: an absent config with nothing installed (an empty
directory is the state `init` exists for), and a config that loads and fails validation.

## Proposed Standard

Not a standards gap — a product decision that needs making. Two candidate shapes, for whoever
owns `doctor`:

1. Run the orphan check with an empty config when the config is absent but installed content
   exists, so the row reports every installed skill and agent as unowned.
2. Keep the skip, and give the `config-missing` verdict a details line naming what is on disk
   ("7 skills and 2 agents are installed here and no configuration declares them").

Either makes the report internally consistent; today the content layer and the operational layer
describe the same directory and only one of them mentions the files.
