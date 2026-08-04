---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/operations/project/write-project-config.ts
standards_docs:
  - .ai-docs/reference/types/operations-types.md
  - .ai-docs/reference/features/operations-layer.md
date: 2026-07-30
reporting_agent: codex-keeper
category: typescript
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: Field deleted from `ConfigWriteResult` in `src/cli/lib/operations/project/write-project-config.ts` by a cli-developer pass on 2026-07-30. `tsc --noEmit` passes and the full unit suite (128 files / 5162 tests) is green, which is the proof no consumer read it. `types/operations-types.md`, `features/operations-layer.md` and `features/configuration.md` were updated from "declared but never populated" to "does not exist". The Proposed Standard below is NOT yet adopted into operations-layer.md's Design Conventions — that part remains open.
---

## What Was Wrong

`ConfigWriteResult` in `src/cli/lib/operations/project/write-project-config.ts` declares

```typescript
globalConfigPath?: string;
```

but `writeProjectConfig` never assigns it, and no caller anywhere reads it. It is dead
surface on an otherwise load-bearing result type.

Because the field is optional, nothing forces the discrepancy to surface: `tsc` is happy,
a reader of the type reasonably assumes the operation reports where it wrote the global
config, and a future caller that reaches for `result.globalConfigPath` gets `undefined`
with no error. The real global config path is derived independently inside
`writeScopedConfigs` via `getProjectConfigPath(os.homedir())` and never returned.

This is the same failure shape as `InstallationInfo.version` (removed in 0.145.0 after it
rendered as `agents-inc vplugin` in `list`): an optional result field that no producer
populates behaves like an ordinary optional until something consumes it.

The contrast with the field added right beside it makes the drift visible — D-240 added
`propagatedProjects: string[]` as a REQUIRED field precisely so that every branch of
`writeScopedConfigs` has to answer for it, and both branches do.

## Fix Applied

**Round 1 (this pass, discovery):** documentation only.
`.ai-docs/reference/types/operations-types.md` and
`.ai-docs/reference/features/operations-layer.md` annotated the field as
"declared but never populated — do not rely on it". Removing it is a code change and
belongs to a developer agent, not to this pass.

**Round 2 (2026-07-30, cli-developer):** the field is deleted. The three reference docs
that described it (`types/operations-types.md`, `features/operations-layer.md`,
`features/configuration.md`) now state the result carries no `globalConfigPath` rather
than warning readers off a field that still exists.

Verification that nothing read it: `npx tsc --noEmit` exits 0, and the full unit suite
passes. Note for future greps — several files hold LOCAL VARIABLES named
`globalConfigPath` (`src/cli/lib/installation/local-installer.ts`, its test file, and a
dozen e2e specs). Those are unrelated to this property and were not touched.

The Proposed Standard below is still unadopted: no "Result fields must have a producer"
rule has been added to `operations-layer.md`'s Design Conventions, so the class of defect
remains unguarded even though this instance is gone.

## Proposed Standard

Add to the "Design Conventions" section of
`.ai-docs/reference/features/operations-layer.md`:

> **Result fields must have a producer.** Every field on an operation's result type must
> be assigned on at least one code path in that operation. An optional field that no
> branch populates is dead surface: it type-checks, it reads as an available value, and
> it silently yields `undefined` to the first caller that trusts it. When an operation's
> result genuinely varies by branch, prefer a REQUIRED field with an explicit empty value
> (`[]`, `null`) over an optional one — that forces every branch to answer for it, which
> is exactly what `propagatedProjects` does and what `globalConfigPath` does not.

Reviewer corollary for `.ai-docs/standards/clean-code-standards.md`: when reviewing a
change that adds a field to an existing result type, grep the type name for OTHER optional
fields and confirm each still has a producer. Result types accrete; the new field is
reviewed, the old ones are not.
