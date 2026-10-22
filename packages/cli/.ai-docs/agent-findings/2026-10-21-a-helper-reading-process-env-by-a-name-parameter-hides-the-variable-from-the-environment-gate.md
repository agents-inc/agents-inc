---
type: missing-standard
severity: low
affected_files:
  - src/cli/lib/installation/install-layout.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  The code never landed in the hidden form: the shared helper takes the value, so both reads still
  name their constant at the call site. The standards line proposed below is not written.
---

## What Was Wrong

`codexUserRoot` and `claudeStateRoot` in `install-layout.ts` each read a variable and treat `""`
as unset. An expressive-ts pass folded the shared rule into `relocatedRootIn(variable)`, which read
`process.env[variable]`. Typecheck and lint passed. `e2e-runner-rosters-match-the-tree.test.ts` ›
"reaches the environment through exactly the constants in ENV_READS_BY_CONSTANT" failed:
`envReadsIn` captures the identifier inside the brackets, so it saw `variable`, a name no roster
holds. `CODEX_HOME_VAR` and `CLAUDE_CONFIG_DIR_VAR` dropped out of the reads, so the e2e doors
would no longer be told to pin them.

The rule exists only as that test and the docblocks in `__tests__/helpers/e2e-runner-doors.ts`. No
standards document says a helper over environment reads has to take the value. A DRY pass reaches
for the name, because that is what both call sites share.

Census: `grep -rnE 'process\.env\[[a-z_$][A-Za-z0-9_$]*\]' src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -v __tests__`
finds 0 hits after the fix.

## Fix Applied

`relocatedTo(process.env[CODEX_HOME_VAR])` and `relocatedTo(process.env[CLAUDE_CONFIG_DIR_VAR])`:
the helper takes the value, and each call site keeps its constant. The gate passes.

## Proposed Standard

In `clean-code-standards.md`, beside the named-constant rules: a helper shared by environment
reads takes the value, never the variable's name. `process.env[...]` stays at the call site with
its constant, so `ENV_READS_BY_CONSTANT` and the e2e doors can see it. The rule does not conflict
with CLAUDE.md, which says nothing about environment reads. The test enforces it already; the
document would say why before anyone trips it.
