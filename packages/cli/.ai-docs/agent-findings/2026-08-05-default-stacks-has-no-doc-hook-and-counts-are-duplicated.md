---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/configuration/default-stacks.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/reference/features/built-in-catalogue.md
  - .ai-docs/reference/type-system.md
  - .ai-docs/reference/features/skills-and-matrix.md
date: 2026-08-05
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

Two documentation-bible rules have no mechanism behind them, and an agent-roster sweep walked into
both.

**1. `default-stacks.ts` fires no doc hook.** The bible's "Doc-Touching Changes" table opens with
_"Every source directory under `src/cli/` must appear here — a directory with no row produces no
hook."_ `src/cli/lib/configuration/**` does have a row, but it points at
`features/configuration.md` and the three `config/*` docs. `reference/features/built-in-catalogue.md`
— the document that owns `defaultStacks`' structural invariants — appears in **no row of the table
at all**. Nothing tells an agent editing `default-stacks.ts` that a doc owns statistics derived from
it. Every number in that doc's "Structural invariants" section had rotted: assignment total,
preloaded-true total, `SHARED_TOOLING` alias count, distinct agent names, per-stack agent counts,
and the two per-stack notes in the stack table.

**2. Five union sizes are written in two documents.** The bible's count-ownership registry assigns
`SkillId` / `SkillSlug` / `Category` / `Domain` / `AgentName` sizes to `reference/type-system.md`
("Counts"). `reference/features/skills-and-matrix.md` ("Current Counts") carries its own row for
each of the five. Its `defaultCategories` row is legitimately its own; the other five are the exact
second copy the registry exists to forbid, and each has to be found by grep on every union change.

## Fix Applied

Values corrected in both documents, so neither is now wrong. The structural defects are untouched —
discovery only.

## Proposed Standard

1. Add a row to the bible's "Doc-Touching Changes" table: `default-stacks.ts` →
   `features/built-in-catalogue.md`, `features/skills-and-matrix.md`. The existing
   `lib/configuration/**` row should not simply absorb it — that row's docs are about config I/O,
   and an agent scanning for its own change will stop at the first match.
2. Delete the `SKILL_MAP` / `SKILL_IDS` / `SKILL_SLUGS` / `CATEGORIES` / `DOMAINS` / `AGENT_NAMES`
   rows from `skills-and-matrix.md`'s "Current Counts", leaving `defaultCategories` (which that
   document does own) plus a one-line pointer to `type-system.md`, matching the pointer style
   `type-system.md` already uses for the Zod schema count.
3. `built-in-catalogue.md`'s invariants are all derivable by evaluating one module. A unit test in
   `src/cli/lib/configuration/__tests__/default-stacks.test.ts` asserting the assignment total, the
   preloaded-true total and the `SHARED_TOOLING` alias count would make the doc's numbers
   self-checking the way `EXPECTED_STACK_COUNT` already makes the stack count self-checking.
