---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/configuration/config-merger.ts
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-04-18
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: missing-rule
status: open
---

## Status (2026-04-21 residual audit)

- **Still open.** Re-verified `mergeConfigs` (`src/cli/lib/configuration/config-merger.ts`) — no `projects` handling anywhere in the whitelist (only `name`, `description`, `source`, `agents`, `skills`, `stack`, `author`, `agentsSource`, `marketplace`). The `const merged = { ...newConfig }` base at line 62 still drops `projects`.
- **Current line numbers in `src/cli/lib/installation/local-installer.ts`** (original finding cited 838/843; refs drifted):
  - HOME-context `writeConfigFile(finalConfig, ...)` — now line 780
  - `if (finalConfig.projects?.length)` propagation guard — now line 783
  - `propagateGlobalChangesToProjects` call site — now line 784
- **Downstream findings this blocks:**
  1. `.ai-docs/agent-findings/2026-04-21-d228-e2e-vacuous-pass-via-home-edit.md` — explicit `blocked_by:` frontmatter link. E2E test for propagation cannot drive via HOME-context edit; left `// KNOWN GAP:` `.not.toStrictEqual(...)` assertion to be uncommented once merger preserves `projects`.
  2. `.ai-docs/agent-findings/2026-04-21-propagation-skipped-observability-gap.md` — sibling/observability concern (cross-references this finding at § "No pre-existing ticket covers this gap"). Not strictly blocked, but Option A (warn() on skip) only becomes fully observable once propagation actually fires from HOME-context triggers.
- **Pickup direction unchanged:** apply the proposed one-liner in § "Proposed Standard" item 1, add merger unit test, uncomment the D-228 E2E `.not.toStrictEqual` assertion.

## What Was Wrong

`mergeConfigs` in `src/cli/lib/configuration/config-merger.ts` explicitly carries
forward specific top-level fields from the existing config (`name`, `description`,
`source`, `agents`, `skills`, `stack`, `author`, `agentsSource`, `marketplace`)
but does NOT carry forward `projects`. The function's `const merged = { ...newConfig }`
base copies only from `newConfig`, which never has a `projects` field (that field
is set by `registerProjectPath` and `deregisterProjectPath` only).

Concrete effect (discovered while building the D-222 E2E test): running
`cc edit` from HOME invokes the write pipeline

writeProjectConfig → buildAndMergeConfig → mergeWithExistingConfig →
mergeConfigs → writeScopedConfigs

where `writeScopedConfigs`'s HOME-context branch (line 838 in
`local-installer.ts`; now line 780 as of 2026-04-21) calls
`writeConfigFile(finalConfig, ...)` with a `finalConfig` whose `projects` field
is now `undefined`. The written global `config.ts` loses its `"projects": [...]`
entry. The subsequent propagation guard `if (finalConfig.projects?.length)` at
line 843 (now 783) returns falsy, so `propagateGlobalChangesToProjects` never
runs.

This silently defeats multi-project propagation whenever the user edits the
global install from HOME. The D-222 test had to route the promotion trigger
through a project-context edit (`writeScopedConfigs`'s line 897 branch,
which uses `effectiveGlobalConfig` — a `...existing` spread that DOES
preserve `projects`) to observe the bug.

## Fix Applied

None — discovery only. The D-222 E2E test was written to avoid this second
bug by using a project-context edit as the propagation trigger. The merger
gap is a separate issue that deserves its own todo.

## Proposed Standard

1. Extend `mergeConfigs` to carry `existingConfig.projects` when `newConfig`
   has no `projects` — symmetric with how `agents`, `skills`, and `stack` are
   preserved. Pattern:

   ```ts
   if (newConfig.projects === undefined && existingConfig.projects) {
     merged.projects = existingConfig.projects;
   }
   ```

2. Add a unit test in `src/cli/lib/configuration/config-merger.test.ts` that
   asserts `projects` survives the merge.

3. Add an E2E regression test that runs `cc edit` at HOME against a global
   config with registered projects, and asserts that propagation still runs
   (and project configs get rewritten).

4. Consider whether the `const merged = { ...newConfig }` base is the right
   pattern at all. `mergeConfigs` is effectively "existing wins for metadata,
   new wins for content" — that could be clearer as a whitelist of fields
   that flow from `existing` rather than the current "touch every field in
   turn" structure.

## Docs Landed — 2026-04-21

The bug is documented verbatim in
`.ai-docs/reference/config/config-merger.md` § "Known Bug — `projects`
Field Drop" (symptom, pipeline, why the project-context branch is
unaffected, cross-ref to this finding). The `Opposite Polarities`
table also has a dedicated `projects` row flagging the drop.

No further docs-only slice remains. Items 1 (merger one-liner), 2
(merger unit test), 3 (HOME-context E2E regression), and 4 (refactor
consideration) are all code-only. Finding status stays `open` until
the merger fix lands; the downstream vacuous-pass finding
(`2026-04-21-d228-e2e-vacuous-pass-via-home-edit.md`) cannot remove
its `// KNOWN GAP:` marker until then.
