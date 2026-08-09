---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/commands/doctor.ts
  - src/cli/lib/installation/installation.ts
standards_docs:
  - .ai-docs/reference/features/configuration.md
date: 2026-08-08
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by:
  CLI-435. `declaresNoContent(config)` is exported from `installation/installation.ts` and asked by
  both surfaces; `doctor` re-asks `loadProjectConfigFromDir(cwd)` when detection says no and routes
  a three-state `ConfigState` union into `checkConfigValid`. The row reads
  `.claude-src/config.ts is valid but declares no skills and no agents` (warn, not fail — `init`
  writes that shape as the blank global pair), and the five rows under it now run on the config
  instead of printing `Skipped (config invalid)` about a valid file. The proposed standard is
  written into `.ai-docs/reference/features/configuration.md` -> "A fourth state one layer up".
  Pinned red-first by two scenarios in `e2e/commands/doctor-corrupt-config.e2e.test.ts` and two
  in `src/cli/lib/__tests__/commands/doctor.test.ts`.
---

## What Was Wrong

CLI-430 fixed one of the two ways `doctor` reports `.claude-src/config.ts not found` about a file
that is on disk. The other survives, and the fix made it visible on one screen.

`checkConfigValid` still takes a post-`null` config, and `runOperationalChecks` still gets that
`null` from `detectProject` → `detectInstallation`. `detectInstallationInDir` deliberately returns
`null` for a config that loads cleanly but declares neither skills nor agents:

> A successfully-loaded config that declares neither skills nor agents is content-less and does not
> count as an installation — init must route to the setup wizard, not the dashboard.

That decision is correct for `init`, which has to choose between a dashboard and a wizard. It is
wrong for the one command whose job is to name the state, for exactly the reason CLI-430 gave: the
message is false and the remedy it offers does not apply. `init` on a content-less config opens the
wizard and writes over it, so the tip is at least harmless here — but the sentence is still untrue.

Hand-verified against `dist/index.js` on a scratch HOME, with a config containing
`name`, `skills: []`, `agents: []` and nothing else. The two rows now contradict each other in
adjacent sections:

```
  Content checks
    Config              ✓  1 config validated
    ...
  Operational checks
    Config Valid        ✗  .claude-src/config.ts not found
                           Run 'npx agents-inc init' to create a configuration
```

The content layer read the file and validated it. The operational layer, four lines later, says it
is not there. Before CLI-430 there was no content row, so the two answers were never on screen
together and the contradiction had nowhere to show.

No existing spec covers it: `doctor.e2e.test.ts`'s "should pass config check with valid config file"
writes `agents: [{ name: "web-developer", scope: "project" }]`, which makes the config an
installation and routes past this branch. Every other config-bearing doctor spec does the same.

## Fix Applied

None — out of CLI-430's scope, which is the parse-failure state and named it. Fixing this one means
`checkConfigValid` receiving the load outcome (`absent` / `loads` / `loads but declares nothing`)
rather than a `null` that has already collapsed three states into one, and deciding what an
installed-nothing config should read as — `is valid, nothing configured` is probably it, since the
file is genuinely fine and the remedy is `init` or `edit`, not repair.

## Proposed Standard

The rule CLI-430 proposed for `.ai-docs/reference/features/configuration.md` — "a surface that
REPORTS on a config must distinguish all three load outcomes" — is the right rule and this is a
fourth outcome it does not cover. Extend it:

> A caller that maps a config to `null` for a reason of its own — corrupt, or content-less, or
> anything else — owes its consumers the reason alongside the `null`. `detectInstallation` answers
> "is there an installation here", not "is there a config here", and a reporting surface that reads
> its `null` as the second question will print a falsehood every time the two answers differ.

The concrete tripwire is a `doctor` spec on a config that loads and declares nothing, asserting the
`Config Valid` row does not read `not found` — the same shape as
`e2e/commands/doctor-corrupt-config.e2e.test.ts`, which is what caught the parse-failure half.
