---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/standards/typescript-types-bible.md
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-04-21
reporting_agent: ralph-loop
category: typescript
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: typescript-types-bible.md updated (generated-unions paragraph, annotate-don't-cast subsection, asserting-lookups subsection, cast-table "Prefer annotation", type-guard narrowing); no new standard needed — bible now aligned with CLAUDE.md
---

## What Was Wrong

The types bible listed `{} as Partial<Record<...>>` as an unambiguously legitimate "Store initialization" boundary cast. CLAUDE.md Type Safety explicitly says: "NEVER use `{} as Record<K, V>` — use `const x: Partial<Record<K, V>> = {}` with a type annotation." The bible allowed cast syntax where CLAUDE.md prefers annotation. Same resulting type, but the cast form hides intent at the assignment site and is easier to drift to `{} as Record<...>` (which IS banned).

Bible also lacked coverage of three concrete patterns CLAUDE.md treats as primary rules:

1. Generated unions (`SkillId` / `SkillSlug` / `Category` / `Domain` / `AgentName`) are auto-generated in `src/cli/types/generated/source-types.ts` — bible described unions in the abstract but never pointed at the generated file or said "don't hand-maintain a parallel list."
2. Runtime type guards (`isCategory` / `isDomain` / `isAgentName` / `isCategoryPath`) in `src/cli/utils/type-guards.ts` — bible pushed for casts with comments at boundaries, never mentioned the guard functions that obviate the cast entirely.
3. Asserting lookups (`getSkillById` / `getSkillBySlug`) replacing `matrix.skills[id]!` non-null assertions — bible never addressed the non-null assertion anti-pattern specifically.

## Fix Applied

Updated `typescript-types-bible.md`:

- Section 2: added "Generated unions are the source of truth" paragraph pointing at `src/cli/types/generated/source-types.ts` and explicitly banning casts like `"web-framework-react" as SkillId`.
- Section 4: added "Initializing an empty record: annotate, don't cast" subsection showing `const x: Partial<Record<...>> = {}` as the preferred form; added "Asserting lookups instead of non-null assertions" subsection pointing at `matrix/matrix-provider.ts`.
- Section 6 cast table: "Store initialization" row changed from "Yes" to "Prefer annotation" with guidance on when cast is still acceptable (inline callback returns).
- Section 6: pointed `typedEntries` / `typedKeys` at their actual home `src/cli/utils/typed-object.ts`; added "Runtime narrowing uses type guards, not casts" subsection with worked example.

D-217 (`source?: string` on `SkillReference` / `Skill`) and D-231 (`version` field removal from `ProjectConfig`) are data-model changes, not TypeScript patterns — no bible edit needed. The zod schema and config-type-writer docs already cross-reference them.

## Proposed Standard

No new rule. The existing CLAUDE.md Type Safety rules are correct; the bible now aligns with them. Going forward, when a cast-allowance table entry conflicts with a CLAUDE.md NEVER/ALWAYS rule, CLAUDE.md wins and the bible must downgrade the allowance.
