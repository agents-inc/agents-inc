---
type: convention-drift
severity: medium
affected_files:
  - src/cli/lib/__tests__/factories/skill-factories.ts
  - src/cli/components/hooks/use-measured-height.ts
standards_docs:
  - CLAUDE.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-07-30
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

In plain terms: the codebase contains four `// eslint-disable-next-line` comments, but
until now nothing ever read them. Standing ESLint up for the first time revealed that
half of them do not do what their author believed.

Four directives exist in `src/` (none in `e2e/` or `scripts/`):

| File                                            | Directive                     | Status after ESLint was made runnable |
| ----------------------------------------------- | ----------------------------- | ------------------------------------- |
| `lib/configuration/config.ts:323`               | `no-control-regex`            | Valid, suppresses a real hit          |
| `utils/exec.ts:19`                              | `no-control-regex`            | Valid, suppresses a real hit          |
| `lib/__tests__/factories/skill-factories.ts:26` | `no-var`                      | **Misplaced — suppresses nothing**    |
| `components/hooks/use-measured-height.ts:51`    | `react-hooks/exhaustive-deps` | **Names a rule that does not exist**  |

**The `no-var` one is the dangerous one.** `skill-factories.ts` reads:

```ts
// eslint-disable-next-line no-var -- `var` avoids TDZ in circular ESM imports (let/const would throw)
// Boundary cast: test factory maps arbitrary skill IDs to category strings (...)
var _canonicalSkillCategories: Record<string, string> | undefined;
```

`eslint-disable-next-line` applies to the _next line_, and the next line is the boundary-cast
comment — not the `var`. So ESLint reports two problems at once: `no-var` on line 28 (unsuppressed),
and "unused eslint-disable directive" on line 26.

Both of those are auto-fixable, and both auto-fixes are wrong. `eslint --fix` would delete the
directive and rewrite `var` to `let` — the exact change the directive's own comment says will throw
at runtime, because `test-fixtures.ts` calls `createMockSkill()` at module scope during a circular
import. A convenience `--fix` in a pre-commit hook would silently introduce a TDZ crash. (This is
why the ESLint entry added to `lint-staged` in the same change is check-only rather than `--fix`.)

The `react-hooks/exhaustive-deps` one is inert rather than dangerous: `eslint-plugin-react-hooks`
is not a dependency, so ESLint reports `Definition for rule 'react-hooks/exhaustive-deps' was not
found` and the surrounding `useEffect` is unchecked. The directive documents an intent that no tool
has ever enforced.

The root cause is the one already recorded in
`2026-07-30-eslint-precommit-gate-has-no-config-and-cannot-run.md`: with no linter in the repo, a
disable comment is indistinguishable from a normal comment. Nothing validates its placement, its
spelling, or whether the rule it names is installed.

## Fix Applied

None — discovery only, deliberately. The task that surfaced this was tooling setup and was
explicitly scoped to "report violations, do not sweep the codebase", so no source file was touched.
The two problems are counted in the 150 baseline violations reported for `npm run lint`.

The one preventive step that _was_ taken: `lint-staged` runs `eslint --no-warn-ignored` without
`--fix`, so the hook cannot apply the destructive `var` -> `let` rewrite described above.

## Proposed Standard

1. **Fix the two drifted directives** (small, independent of any other cleanup):
   - `skill-factories.ts` — move the `no-var` directive to sit immediately above the `var`
     declaration, below the boundary-cast comment. Two adjacent directive/comment lines must be
     ordered so the disable is last.
   - `use-measured-height.ts` — either add `eslint-plugin-react-hooks` to the config (it is the
     rule the codebase already assumes exists for Ink/React hooks) or delete the dead directive.
     Do not leave it naming an uninstalled rule.

2. **Add a rule to `.ai-docs/standards/clean-code-standards.md` § 14 (Comments)**: an
   `eslint-disable-next-line` must be the line immediately preceding the code it suppresses. If
   another comment (a `// Boundary cast:` annotation, JSDoc) also belongs there, the disable
   directive goes last. State the failure mode — a directive one line too high suppresses nothing
   _and_ becomes an auto-fixable "unused directive" that `--fix` will silently delete.

3. **Consider enabling `linterOptions.reportUnusedDisableDirectives`** in `eslint.config.js` once
   the baseline is clean. ESLint reports unused directives as warnings by default in flat config
   (which is how this was caught); raising it to `"error"` makes stale suppressions a hard failure
   rather than something that scrolls past in a 150-problem report.
