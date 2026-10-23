---
type: anti-pattern
severity: low
affected_files:
  - apps/editor/src/features/configure/components/stack-switch-dialog.tsx
  - apps/editor/src/features/configure/components/stack-grid.tsx
  - apps/editor/src/features/configure/lib/use-apply-stack-request.ts
  - apps/editor/src/features/configure/lib/derive.ts
  - apps/editor/src/features/configure/components/marketplace-switch-dialog.tsx
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-10-22
reporting_agent: cli-developer
category: typescript
domain: web
root_cause: missing-rule
status: resolved
resolved_by: >-
  The five handlers are now switches ending in `default: { const _exhaustive: never = … }`
  (`targetNameOf`, `isApplied`, the handler `useApplyStackRequest` returns, `unselectedCell`,
  `descriptionFor`).
  The proposed standard is not written.
---

## What Was Wrong

Five editor handlers branched over a discriminated union with an if-chain. Each tested every
variant but the last and let the last fall through to the closing `return`. Three branch over
`StackRequest` (`apps/editor/src/stores/ui-store.ts`). The fourth is `toGridCell` in `derive.ts`,
over `SelectionVerdict` from `@workspace/matrix`. The fifth is `descriptionFor` in
`marketplace-switch-dialog.tsx`, over that file's `TargetState`.

**A new variant compiles into that last branch, unless the branch happens to read a field the
variant lacks.** Measured with a probe that type-checks `apps/editor/tsconfig.app.json` through the
compiler API, with one variant spliced into the union's source in memory and nothing written:

| Splice                                                               | Before (if-chains)                                                                    | After (switches)                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `\| { kind: "linked"; stackId: string \| null }` into `StackRequest` | 1 error: TS2339 `Property 'saveId' does not exist` in `use-apply-stack-request.ts`    | 3 errors: TS2322, one per handler                  |
| `\| { status: "required"; reason: string }` into `SelectionVerdict`  | 0 errors                                                                              | 1 error: TS2322 in `derive.ts`                     |
| `\| { status: "stale"; error: string }` into `TargetState`           | 1 error: TS2339 `Property 'matrix' does not exist` in `marketplace-switch-dialog.tsx` | 1 error: TS2322 in `marketplace-switch-dialog.tsx` |

So, before: `targetNameOf` named a `linked` request as a catalogue stack, `isApplied` compared it
against `stackId`, and a `required` verdict drew a plain cell. All of this compiled. The one error
the compiler did raise was an accident of property access, worded about `saveId` rather than about
the missing case. A baseline run with no splice reports 0 errors both before and after.

## Fix Applied

Each handler is now a `switch` with every case named and a `never` default, matching
`incompatibleReasonOf` in `derive.ts` and `noteFor` in `use-install-command.ts`. The editor's unit
suite and Playwright specs passed unchanged.

## Proposed Standard

`typescript-types-bible.md`: a function that branches over a discriminated union of three or more
variants is a `switch` with a `never` default, not an if-chain whose closing `return` stands for
the variant left over. No CLAUDE.md rule conflicts. No gate holds the if-chain shape: neither lint
nor `tsc` reports one. Only the probe above shows it, and the probe is not tracked.
