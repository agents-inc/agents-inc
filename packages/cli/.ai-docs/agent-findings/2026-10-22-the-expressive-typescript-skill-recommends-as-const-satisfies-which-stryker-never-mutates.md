---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/configuration/config.ts
  - src/cli/lib/configuration/scope-diff.ts
standards_docs:
  - docs/architecture.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: shared
root_cause: rule-not-visible
status: open
---

## What Was Wrong

Pattern 8 of the `meta-design-expressive-typescript` skill tells an author to write static
configuration as `as const satisfies Shape`. Stryker gives that form zero mutants and does not report
it. `2026-10-20-stryker-never-mutates-code-under-a-typescript-as-and-the-report-does-not-say-so`
measured this: a type annotation, or `satisfies` without `as const`, is mutated.

The skill does not mention this, and no gate would notice a conversion. Typecheck, lint, the unit
specs and the e2e specs all stay green. The mutants simply disappear from the next report, with no
Ignored entry.

Every module-level constant in this lane that Pattern 8 could apply to is already annotated:

```
grep -nE '^(export )?const [A-Za-z_0-9]+: [^=]+= [\[{]|^(export )?const [A-Za-z_0-9]+: [A-Za-z<]+$' src/cli/lib/configuration/*.ts
```

An annotation already checks an object literal's shape, including excess properties. So converting
one would add only literal types, which none of these constants' readers use. In `config.ts` and
`scope-diff.ts` it would also take data out of mutation testing: the SSRF tables
(`PRIVATE_IPV4_SUBNETS`, `PRIVATE_IPV6_SUBNETS`, `IPV4_CARRYING_FORMS`) and `AGENT_SETTINGS`.

## Fix Applied

None to the skill, because it lives in `agents-inc/skills`. This lane left every annotated constant
as it was. It took the benefit Pattern 8 actually offers without adding an `as`: `REMOTE_PROTOCOLS`
was already `as const`, so `validateRemoteSource` now takes the literal union rather than `string`.
A misspelt `protocol === "htp://"` used to compile and is now TS2367.

## Proposed Standard

The skill's Pattern 8 should say: use `as const satisfies` only where a reader consumes the literal
types (`typeof`/`keyof`, narrowing). Otherwise use an annotation or `satisfies` alone. It should also
say that under Stryker, `as const` costs every mutant beneath it. A pass applying the skill can
census its own diff with `git diff | grep -n '^+.*as const satisfies'`. No honest automatic gate
exists, because the loss shows up only as an absence in a mutation report.
