---
type: convention-drift
severity: low
affected_files:
  - packages/cli/src/cli/commands/compile.ts
  - packages/cli/src/cli/commands/uninstall.tsx
  - packages/cli/src/cli/utils/messages.ts
  - packages/cli/src/cli/lib/operations/project/compile-agents.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  The command and message sites are fixed. The one sibling outside that lane, the active-at-scope
  filter in lib/operations/project/compile-agents.ts, still spells the predicate out.
---

## What Was Wrong

Two named helpers were re-implemented inline beside callers that could have called them, so the
reader had to simulate each copy to see it was the helper.

- `compile.ts` `hintGlobalScopedAgents` counted global sub-agents with
  `(agent) => !agent.excluded && agent.scope === "global"`, which is `isActiveAt(agent, "global")`
  (`@workspace/compile`, re-exported by `lib/configuration/scope-predicates.ts`). The same file
  already imports and calls `isActiveAt` elsewhere.
- Five count lines built `${n} ${n === 1 ? "x" : "xs"}` by hand where `plural(n, "x")` in
  `utils/string.ts` produces the same text: `marketplacesRefreshFailed`, `registeredProjectsUpdated`
  and `unmarkedAgentsKept` in `utils/messages.ts`, and the two "Removed N ..." lines in
  `uninstall.tsx`.

The output was correct in every case; the defect is only that each copy reads as new logic.

## Fix Applied

Each site now calls the helper; the printed text is byte-identical (unit and e2e specs that pin
those lines pass unchanged).

Census, every hit read. The `isActiveAt` shape:

```
grep -rnE '!\s*[a-z]+\.excluded\s*&&\s*[a-z]+\.scope\s*===|\.scope\s*===\s*"(global|project)"\s*&&\s*!\s*[a-z]+\.excluded' packages/cli/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

Before: two hits, `compile.ts` and `lib/operations/project/compile-agents.ts`. After: the
`compile-agents.ts` hit only, outside the lane that made this pass (reported, not edited).

The hand-rolled plural:

```
grep -rnE '=== 1 \? "[a-z]+" : "[a-z]+s"' packages/cli/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

After: two hits, `doctorReportsTheSame` in `utils/messages.ts` (`file`/`files`) and
`lib/schemas.ts` (`field`/`fields`). Neither prints the count before the noun, so neither is
`plural()`'s shape and both are correct as written.

## Proposed Standard

None new. A review-time tell: an inline `count === 1 ?` beside a printed count, or an
`excluded`-and-`scope` conjunction, is a helper call written out.
