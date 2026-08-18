---
type: anti-pattern
severity: high
affected_files:
  - e2e/assertions/four-surfaces.ts
  - e2e/helpers/type-check-probe.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-08-18
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `e2e/assertions/four-surfaces.ts` now passes `["SkillId", "AgentName", "Category"]` to
  `probeConfigTypesNarrowing` — the alias NAMES the function documents — and the finding is
  judged on the `TS2322` diagnostic rather than on a non-zero exit code, matching the seven
  call sites that already did both.
---

## What Was Wrong

`probeConfigTypesNarrowing(claudeSrcDir, aliases)` takes the NAMES of the generated type aliases
to import. It supplies the bogus literal itself. Every other caller passes
`["SkillId", "AgentName", "Category"]`.

The newly added `e2e/assertions/four-surfaces.ts` passed a literal instead:

```ts
const BOGUS_ID = "definitely-not-a-real-id-9f3a";
const narrowing = await probeConfigTypesNarrowing(claudeSrc, [BOGUS_ID]);
// ...
claim: "config-types.ts still rejects a literal outside its union",
held: narrowing.exitCode !== 0,
```

The probe module that renders from that is

```ts
import type { definitely-not-a-real-id-9f3a } from "./config-types";
export const probedefinitely-not-a-real-id-9f3a: definitely-not-a-real-id-9f3a = "...";
```

which is not parseable TypeScript. `tsc` exits 2 with `TS1005`, `TS1351` and `TS1128` — a
**syntax** verdict, never reaching type checking at all. `exitCode !== 0` therefore held
unconditionally, so the one check whose whole purpose is to tell a narrow union from a collapsed
one could not fail.

Measured against a fixture, both halves:

| `config-types.ts`                               | probe argument  | exit | diagnostics      |
| ----------------------------------------------- | --------------- | ---- | ---------------- |
| `SkillId = "web-framework-react" \| …` (narrow) | the literal     | 2    | TS1005/1351/1128 |
| `SkillId = string` (collapsed — must be caught) | the literal     | 2    | TS1005/1351/1128 |
| `SkillId = string` (collapsed — must be caught) | the alias names | 0    | none             |
| `SkillId = "web-framework-react" \| …` (narrow) | the alias names | 2    | TS2322           |

Row 2 is the defect: the failure the check exists to catch produced the same verdict as success.

This is why the assertion could not be trusted before use. Any journey closed with it would have
claimed surface 4 while reading nothing.

## Fix Applied

`e2e/assertions/four-surfaces.ts`:

- `BOGUS_ID` replaced by `GENERATED_ALIASES = ["SkillId", "AgentName", "Category"] as const`, with
  a comment stating what the argument is and how the literal form failed.
- The finding's verdict is now `narrowing.output.includes(TS_NOT_ASSIGNABLE)`, not
  `exitCode !== 0`, and reports tsc's output as its `detail` when it does not hold. A probe that
  never compiled has asked nothing about the unions, and only the diagnostic distinguishes the two.

Verified by the same fixture table above, and by every spec this pass added `expectFourSurfaces`
to: with the alias form the probe reports `TS2322` against real installs at both scopes.

## Proposed Standard

`probeConfigTypesNarrowing`'s signature cannot distinguish the two arguments — both are
`readonly string[]` — so the mistake is invisible at the call site and at `tsc`. Two things would
close it, in `.ai-docs/standards/e2e/README.md` under the type-check probe:

1. **State the rule where it is broken.** "A narrowing probe is judged on `TS2322`, never on a
   non-zero exit code. `tsc` exits non-zero for a probe that failed to parse, and a probe that
   failed to parse asked nothing." The seven existing call sites all assert both; the eighth did
   not, and nothing said they had to.

2. **Give the helper a shape that cannot take the wrong string.** `aliases: readonly string[]`
   invites any string. A `GeneratedAlias` union over the six alias names would have made this a
   compile error, and that set is already fixed by `assembleConfigTypesSource` in
   `src/cli/lib/configuration/config-types-writer.ts`, so it has one true source.

The wider rule this belongs under is the existing "never broaden an assertion to make it pass" in
`CLAUDE.md` — its unstated other half is that an assertion which has never been shown capable of
failing has not been shown to assert anything. The repo's own process rule ("watch them fail")
applies to a shared assertion helper as much as to a spec, and a helper is where it is easiest to
skip, because the specs that call it are green.
