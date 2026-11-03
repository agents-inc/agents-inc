---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/config-gate/index.ts
  - src/cli/lib/config-gate/propagate.ts
  - src/cli/lib/seed/seed-apply.ts
  - src/cli/lib/config-gate/recompile.ts
  - src/cli/lib/config-gate/classify.ts
  - src/cli/lib/content-validator.ts
  - src/cli/lib/operations/skills/discover-skills.ts
  - src/cli/commands/uninstall.tsx
standards_docs:
  - CLAUDE.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-11-02
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  REPO-55 follow-ups (2026-11-03): the five left are factories too (`nothingRecompiled`,
  `noChanges`, `nothingValidated`, `noLocalSkills`, `nothingKept`), and packages/cli/CLAUDE.md's
  rule now covers any constant a function returns or defaults to, exported or not. Its census, tests
  dropped, returns nothing.
---

## What Was Wrong

Three private constants in the config-loading code held an empty result whose fields are arrays,
and every caller got the same object:

- `NOTHING_PROPAGATED` in `config-gate/index.ts`, used as a default parameter and as a return
  value. `propagate.ts` built a second, inline copy of the same empty result.
- `NO_GLOBAL_ENTRIES` in `seed/seed-apply.ts`, put in both `installed` and `keptAsInstalled` of one
  returned object, so even the two fields of one result shared their arrays.
- `NOTHING_KEPT` in `seed/seed-apply.ts`, returned as `kept`.

The propagation fan-out pushes each project into its result's lists. One caller writing into a
shared empty result would change it for every later caller, and no type flags that.

The CLAUDE.md rule names only an exported constant ("NEVER export a shared constant whose value
holds a mutable array or object that callers receive BY IDENTITY"). All three were private, so the
rule's wording did not reach them. Its census grep does (`^(export )?const`), and
`clean-code-standards.md` 8.8 already calls a module-private one a latent trap.

## Fix Applied

REPO-55's second round, config-loading lane: `nothingPropagated()` in `propagate.ts` returns a
fresh result and replaces both copies. `nothingHeld(decoded)` in `seed-apply.ts` replaces
`NO_GLOBAL_ENTRIES`. The empty `kept` result is an inline literal. The round's report says no test
was rewritten.

Class census, 2026-11-02, from `packages/cli`: the CLAUDE.md command with tests dropped.

```
grep -rn -A6 -E '^(export )?const [A-Z][A-Z0-9_]+: [A-Z]' src/cli --include='*.ts' --include='*.tsx' | grep -E '\[\],?$|: \[\]' | grep -v -E '\.test\.|__tests__'
```

It names five production constants, none changed by the round. Two are exported:
`NOTHING_RECOMPILED` in `config-gate/recompile.ts`, and `NO_CHANGES` in `config-gate/classify.ts`.
Three are private: `NOTHING_VALIDATED` in `content-validator.ts`, `NO_LOCAL_SKILLS` in
`operations/skills/discover-skills.ts` and `NOTHING_KEPT` in `commands/uninstall.tsx`. The round
left the two exported ones because a test factory outside its lane imports them, and the other
three were outside its files.

## Proposed Standard

Widen the CLAUDE.md rule from "NEVER export a shared constant…" to any constant a function returns
or uses as a default, exported or not. The hazard is the value leaving the function, not the
export. The census grep already covers both. This widens an existing rule and conflicts with
nothing in CLAUDE.md.
