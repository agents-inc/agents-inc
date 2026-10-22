---
type: anti-pattern
severity: low
affected_files:
  - packages/compile/src/seed-to-config.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-20
reporting_agent: cli-developer
category: typescript
domain: shared
root_cause: rule-not-visible
status: resolved
resolved_by: >-
  The assignment rows of seedToInstallSelection now narrow with the file's own `isAgentName`; the
  parallel Set and the cast it guarded are deleted (REPO-44 expressive pass, lane
  E6-seed-to-config).
---

## What Was Wrong

`seedToInstallSelection` in `packages/compile/src/seed-to-config.ts` checked a sub-agent name
with `KNOWN_AGENTS.has(agentName)` (`KNOWN_AGENTS = new Set<string>(AGENT_NAMES)`), then asserted
it with `agentName as AgentName`, commented "Boundary cast: guarded by KNOWN_AGENTS immediately
above." The same file already declared `isAgentName(value): value is AgentName` over the same
roster, and `readAgentMap` used it. The cast was therefore unnecessary: the guard narrows without
one. It also counted as a widening cast for `scripts/check-boundary-union-casts.ts`. That checker
listed it at line 878, beside the three real catalogue-boundary casts that keep the file in
`COMPILE_BACKLOG`.

`packages/cli/CLAUDE.md` -> "ALWAYS use type guards (`isAgentName()` ...) instead of `as` casts
for runtime narrowing" covers this. The rule's examples point at `utils/type-guards.ts` in the
CLI, though, and `@workspace/compile` cannot import that module, so the rule did not visibly
reach a module that declares its own guard.

## Fix Applied

Replaced the `Set.has` check and the cast with `isAgentName(agentName)`, and deleted
`KNOWN_AGENTS`, which had no other reader. The checker now lists three casts for the file
(`SkillId`, `Category`, `Domain`), so the file stays in `COMPILE_BACKLOG` and its spec stays
green.

Census (sample-free; every hit read). This grep lists every `Set` built over a generated roster:

```
grep -rnE "new Set(<string>)?\((AGENT_NAMES|SKILL_IDS|CODEX_MODEL_NAMES|DOMAINS|CATEGORIES)\b" packages apps --include='*.ts' --include='*.tsx'
```

It returns seven hits. Four are in `packages/matrix/src/read-model/`: `domains.ts`,
`preload-defaults.ts`, `sub-agents.ts` and `catalog.ts`. Each backs a type guard or an assertion,
with no cast after it. Two are in test files, and one is `OFFERED_CODEX_MODELS` in this file,
which backs `isOfferedCodexModel`. None repeats the guard-then-cast shape.
`grep -rn "Boundary cast: guarded by"` now returns nothing.

## Proposed Standard

None new. The CLAUDE.md rule is sufficient once it is read as package-independent. A reviewer's
check is that a `Boundary cast` comment naming a guard ("guarded by X immediately above") is
itself the tell. If X can be written as a type predicate, the cast should be the predicate. This
does not conflict with any NEVER/ALWAYS rule.
