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
status: partial
partial_note: >
  Code side COMPLETE for both drifted directives; docs side still pending. `use-measured-height.ts:51`
  — inert `react-hooks/exhaustive-deps` directive deleted, intent kept as prose (2026-08-01,
  cli-developer). `lib/__tests__/factories/skill-factories.ts:26` — the dangerous `no-var`
  misplacement is fixed by reordering so the directive sits immediately above the `var`
  (2026-08-01, cli-tester, during the test-file no-unused-vars burndown); both the `no-var` error
  and the "unused eslint-disable directive" error are gone, verified by a clean `npx eslint .`.
  STILL PENDING: Proposed Standard items 2 and 3 — the clean-code-standards § 14 rule and the
  `reportUnusedDisableDirectives` decision are unwritten — and no decision has been taken on
  adopting `eslint-plugin-react-hooks`.
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

## Update — 2026-08-01 (cli-developer, `src/cli` no-unused-vars burndown)

Proposed Standard item 1, second bullet, is now done — by the **delete** branch, not the
install-the-plugin branch. `eslint-plugin-react-hooks` was deliberately NOT added: that is an
owner-level decision, and adding it to an Ink/React codebase would surface a fresh batch of
`exhaustive-deps` reports across every component, which is not something a lint-burndown task
should decide unilaterally.

What replaced the directive in `use-measured-height.ts` is a plain comment in the same position,
because the directive's only surviving value was the intent it recorded — deleting it outright
would have destroyed a signal while fixing nothing:

```ts
    // Deps are deliberately empty: this is a mount-only retry ladder. `measure`
    // is re-created every render, so listing it would re-arm the timers on every
    // render instead of once.
  }, []);
```

**The dependency situation the owner needs in order to decide on the plugin.** The hook has three
effects and `exhaustive-deps` would have something to say about two of them:

| Effect                        | Deps       | What the rule would report                                                                                               |
| ----------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `measure()` after each render | _(none)_   | Nothing — a bare effect is intentional and the rule does not flag it.                                                    |
| retry ladder (`[0, 16, 50]`)  | `[]`       | Would demand `measure`. Honouring it re-arms three timers on every render instead of once; the omission is correct.      |
| `stdout` resize listener      | `[stdout]` | Would ALSO demand `measure` — and this one was never suppressed, so the "one directive" framing understated the surface. |

The shared cause in both cases is that `measure` is a plain arrow re-created every render rather
than a `useCallback`. If the plugin is ever adopted, the fix is to memoise `measure` (with `ref`
and `setMeasuredHeight`, both stable) rather than to widen the dep arrays — widening them is what
the deleted directive existed to prevent.

The `no-var` half of this finding is untouched and remains the dangerous one.

## Update — 2026-08-01 (cli-tester, test-file `no-unused-vars` burndown)

Proposed Standard item 1, **first** bullet is now done. `skill-factories.ts` reads:

```ts
// Boundary cast: test factory maps arbitrary skill IDs to category strings (...)
// eslint-disable-next-line no-var -- `var` avoids TDZ in circular ESM imports (let/const would throw)
var _canonicalSkillCategories: Record<string, string> | undefined;
```

Only the two comment lines swapped — no code change, both comments' content kept verbatim. The
directive is now the line immediately preceding the `var`, which is what item 1 prescribed. Both
reported problems disappear together: `no-var` on the `var` line is suppressed again, and the
"unused eslint-disable directive" report on the directive line goes away because the directive now
has something to suppress. Confirmed by `npx eslint .` returning zero problems repo-wide.

This closes the code side of the whole finding. What remains is documentation only: the
clean-code-standards § 14 rule (item 2) and the `reportUnusedDisableDirectives` decision (item 3).
Item 3 is now actionable in a way it was not on 2026-07-30 — the baseline the item was waiting on
("once the baseline is clean") is clean as of today, so raising unused directives to `"error"` can
be decided on its merits rather than deferred.

One observation for whoever writes item 2. This directive was misplaced for as long as it existed
and nothing caught it, but the reason it was _worth_ catching is narrower than "stale suppression":
it is that the misplacement made a correct-and-load-bearing `var` look like an unfixed lint error,
and the auto-fix for that apparent error is a runtime crash. The § 14 rule should lead with that
failure mode rather than with tidiness — a directive one line too high is not cosmetic drift, it is
an armed `--fix` trap.
