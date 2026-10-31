---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/configuration/scope-diff.ts
  - src/cli/lib/seed/seed-apply.ts
  - src/cli/utils/messages.ts
  - src/cli/base-command.ts
  - src/cli/commands/compile.ts
  - src/cli/commands/init.tsx
  - src/cli/commands/edit.tsx
  - src/cli/commands/share.ts
  - src/cli/lib/seed/installation-payload.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-30
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: rule-not-visible
status: resolved
resolved_by: >-
  `namedByActiveEntries` in `lib/configuration/scope-diff.ts` is the one index; `panelRowEntries`
  and `activeEntriesOf` call it, and the six messages take a `NamedBy` and name through
  `skillName` (`getSkillEntryDisplayName`).
---

## What Was Wrong

CLAUDE.md (Data Integrity, the `displayName` rule) says a row drawn from an entry reads that
record, then the seated catalogue, then the id. The `--from` panel and the lines under it followed
it; six other messages printed bare ids (`carriedSkillsWritten`, `skillAssignedToNoAgent`,
`scopeBlockedStackAssignment`, `sharedConfigProjectScopeAtHome`, `shareRefusesEjectedSkills`,
`sharedSkillsLeftBehind`). The index a message reads names from (active entries keyed by id) was
built inline twice (`panelRowEntries` in `seed-apply.ts`, `activeEntriesOf` in `scope-diff.ts`),
and these six needed it at four more call sites.

## Fix Applied

One exported builder, `namedByActiveEntries`, beside `NamedBy`; the two inline copies call it, and
each of the six messages takes a `NamedBy`. Census of the builder's callers:
`grep -rn "namedByActiveEntries(" src/cli --include='*.ts' --include='*.tsx'`.

## Proposed Standard

None that a gate could hold honestly: a scan for a skill-id parameter without a `NamedBy` beside it
is satisfiable by adding an unused parameter. The CLAUDE.md rule already states the order; a new
message naming skills should take a `NamedBy` built by `namedByActiveEntries` and name through
`skillName` in `utils/messages.ts`.
