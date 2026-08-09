---
type: convention-drift
severity: low
affected_files:
  - packages/cli/.ai-docs/reference/concepts/scope-system.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-08
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`concepts/scope-system.md` -> "Scope Predicates" ends in a table headed **Consumers:**, listing the
modules that use `configuration/scope-predicates.ts`. CLI-437 corrected two of its rows — one
attributed a predicate to `local-installer.ts` that the module never imported, and the module that
took the moved predicates had no row at all — and in doing so established that the table is
attempting completeness. It does not reach it.

Ten non-test modules import `scope-predicates` directly. The table names five:

| Module                                 | In the table                              |
| -------------------------------------- | ----------------------------------------- |
| `configuration/config-generator.ts`    | yes                                       |
| `configuration/config-merger.ts`       | yes                                       |
| `configuration/config-types-writer.ts` | yes                                       |
| `installation/local-installer.ts`      | yes                                       |
| `config-gate/propagate.ts`             | yes (added)                               |
| `config-gate/index.ts`                 | **no**                                    |
| `stores/wizard-store.ts`               | **no**                                    |
| `commands/edit.tsx`                    | **no**                                    |
| `commands/init.tsx`                    | **no**                                    |
| `configuration/index.ts`               | re-export, noted in prose below the table |

Plus the indirect consumers reaching `effectivelyExcludedSkillIds` through the `configuration`
barrel: `agents/agent-recompiler.ts`, `commands/doctor.ts`, `commands/compile.ts`.

One row is wrong rather than missing: `config-types-writer.ts` is credited with
`activeProjectAgentNames` and imports `activeAgentNames` beside it.

**The header is the defect, not the omissions.** A table called "Consumers" with no stated scope
reads as the set, and a reader checking whether a predicate is safe to change will use it as one —
which is exactly the use the two corrected rows show it failing at. Either it enumerates every
importer, or it says which subset it enumerates and why (plausibly "the `lib/` modules"; the four
absentees are two commands, a store and a barrel, which is a coherent boundary nobody has written
down).

## Fix Applied

None beyond CLI-437's scope, which owned the symbols that had moved out of `local-installer.ts` and
corrected exactly those rows. Extending or re-scoping the table is a decision about what the table
is for, and belongs to whoever owns the document rather than to a drift sweep passing through.

Derivation, so the next pass does not repeat it:

```
grep -rn "scope-predicates" src/cli --include="*.ts" --include="*.tsx" | grep -v "\.test\." | grep "from"
```

## Proposed Standard

**A table that enumerates callers, consumers or importers states its scope in the header or in one
line above it.** "Consumers" is a claim of completeness by default, and completeness over a set the
compiler can enumerate decays every time someone adds an import — silently, because nothing links
the new import to the document. Where the full set is wanted, say so and give the derivation
command in the document (this repository already does that for
`check-shared-eslint-config.ts`'s verdicts); where a subset is wanted, name the boundary. For
`documentation-bible.md`, beside "A Count Lives in Exactly One Document" — the same argument one
level up, since an enumeration is a count you can read off.
