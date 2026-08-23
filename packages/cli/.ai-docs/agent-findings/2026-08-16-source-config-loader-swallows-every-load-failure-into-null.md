---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/src/cli/lib/configuration/config.ts
  - packages/cli/src/cli/lib/configuration/config-loader.ts
  - packages/cli/src/cli/lib/schemas.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-16
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The general posture this finding asked for landed 2026-08-20, under the owner ruling that a
  source config which exists and cannot be evaluated must hard error and say so. `loadSourceConfig`
  now raises every load failure and answers `null` only for a missing file, which is this finding's
  primary "What to do" recommendation rather than its narrower alternative — and the two loaders of
  the same file no longer disagree. The tolerant caller it predicted exists and asks for it
  explicitly: `validateRegisteredSources` is the one DEGRADE posture, because `doctor` reports
  rather than refuses, and it reaches the raise through a `readsConfig: true` row and `safeCheck`.
  The refusal reuses `configUnreadableError`, the vocabulary `ensureConfigReadable` already prints
  for the sibling loader. The spec this finding named as asserting the swallow — "should return null
  for invalid TypeScript in project config" — is retargeted to assert the refusal, and the stale
  JSDoc residue it flagged in `config-precedence.test.ts` is corrected. Recurrence is now held by a
  test rather than by prose: `src/cli/lib/configuration/__tests__/config-readers-agree.test.ts`
  holds all four readers of `.claude-src/config.ts` to the same contract and asserts the roster
  against what the two modules export, so a fifth reader cannot land with the old posture.
---

# The source-config loader swallows every load failure into `null`

## What was found

`loadSourceConfig` in `lib/configuration/config.ts` wraps its `loadConfig` call in a `try/catch`
that turns **every** failure into `verbose(...)` plus `return null`:

```ts
try {
  data = await loadConfig(configPath, projectSourceConfigSchema);
} catch (error) {
  verbose(`Failed to load ${scope} source config at ${configPath}: ${getErrorMessage(error)}`);
  return null;
}
```

`loadConfig` throws on schema rejection — that is its documented contract, and
`loadProjectConfigFromDir` relies on it to raise `ConfigLoadError`. On this path the throw is
caught, `loadEffectiveSourceConfig` sees `null`, and `resolveSource` walks past the project and
global rungs to `DEFAULT_SOURCE`. The only trace is a `verbose` line, which is off unless the user
passed `-v`.

The result: **a config file the schema refuses is indistinguishable from a config file that is not
there**, and the run silently installs from the public marketplace instead of the one the config
named.

## Why it matters now

CLI-501 rules that a config carrying a pre-rename key must fail loudly rather than fall through.
The natural place to implement that is the Zod schema — both loader schemas are `.passthrough()`,
so the obvious fix is to declare the old key and reject it. **That fix alone does not close the
defect.** The rejection is raised inside `loadConfig`, caught here, and converted back into the
silent fall-through the ruling exists to prevent. A reviewer looking at the schema diff would see a
correct-looking guard and a green-looking `resolveSource`.

This is not hypothetical: `src/cli/lib/__tests__/user-journeys/config-precedence.test.ts` now
carries two specs (`a config carrying a field name from before the rename`) that fail today and
will keep failing against a schema-only fix.

## Why nothing caught it

The catch is indistinguishable from the legitimate `null` two lines above it — the "file does not
exist" case — and both return the same value, so no caller can tell them apart even in principle.
The sibling loader on the same directory, `loadProjectConfigFromDir`, gets this right: it returns
`null` **only** for a missing file and raises `ConfigLoadError` for anything else, with a comment
explaining exactly why collapsing the two was a defect ("a broken install passed as absent").
The two loaders read the same file and disagree about what an unreadable one means.

There is also no test asserting that `resolveSource` surfaces a corrupt config — the existing
`should return null for invalid TypeScript in project config` spec _asserts the swallow_ as the
intended behaviour.

## What to do

Give `loadSourceConfig` the posture its sibling already has: `null` for a missing file, propagate
everything else. `resolveSource`'s callers all run inside commands that own a `handleError`, so a
raised error reaches the user. If a caller genuinely needs the tolerant behaviour (e.g. `doctor`
reporting rather than refusing), it should ask for it explicitly rather than have every caller
inherit it.

The narrower alternative — keep the catch but re-raise when the failure is a schema rejection
rather than a parse failure — closes CLI-501 without settling the general posture, and leaves the
two loaders disagreeing.

## Related

- **Live configs carry dead keys — `domains` and `selectedAgents` are on no schema and nothing
  reads them — surviving purely on `.passthrough()` on both loader schemas.** That is the _entry_
  half of this defect; this finding is the _exit_ half.
- A second, smaller gap found in the same pass: nothing under `src/schemas/*.json` had any test at
  all before this one. `src/cli/lib/schemas.test.ts` now pins the field names the two
  hand-maintained files publish. It pins the marketplace keys only, so a `required` entry naming a
  field `ProjectConfig` does not have would still pass it.
