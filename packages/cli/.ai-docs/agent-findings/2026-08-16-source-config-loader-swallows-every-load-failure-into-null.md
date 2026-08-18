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
status: partial
partial_note: >-
  The load-bearing half of the defect is DEAD; the general posture question this finding raised is
  not. `loadSourceConfig` in `src/cli/lib/configuration/config.ts` no longer swallows every
  failure — it re-raises `ConfigSchemaError` and `ConfigDefaultExportError` before the
  `verbose` + `return null`, under a comment that restates this finding's rule ("a swallowed
  refusal is indistinguishable from a config that is not there — it walks past this rung to
  DEFAULT_SOURCE and installs from a marketplace nobody named"). So the CLI-501 trap the finding
  was written to prevent is closed: `src/cli/lib/__tests__/user-journeys/config-precedence.test.ts`
  -> "a config carrying a field name from before the rename" now has two specs asserting that
  `resolveSource({ caller: "stored" })` REJECTS rather than repointing, one for the top-level key
  and one for a skill entry's provenance key. What landed is the finding's own "narrower
  alternative", and it says of itself that it "closes CLI-501 without settling the general
  posture, and leaves the two loaders disagreeing" — which is still true. A parse or evaluation
  failure is still reported as absence here, while the sibling `loadProjectConfigFromDir` on the
  same file raises `ConfigLoadError` for anything but a missing file. The primary recommendation
  under "What to do" — `null` for a missing file, propagate everything else, with a tolerant mode
  asked for explicitly by callers such as `doctor` that report rather than refuse — is unadopted.
  One residue worth naming: the JSDoc above that describe block in `config-precedence.test.ts`
  still opens "`loadSourceConfig` turns every load failure into `null`", which the specs beneath
  it now disprove.
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

- `2026-08-16-hand-maintained-json-schema-requires-a-field-the-type-does-not-have.md` — the same
  audit's observation that live configs carry dead keys surviving on `.passthrough()` alone. That
  is the _entry_ half of this defect; this finding is the _exit_ half.
- A second, smaller gap found in the same pass: nothing under `src/schemas/*.json` had any test at
  all before this one. `src/cli/lib/schemas.test.ts` now pins the field names the two
  hand-maintained files publish, which is the "at minimum a test" option that finding proposed.
