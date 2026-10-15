# REPO-44 — tech debt and the lint-rules rollout

Owner 2026-10-15. Order matters: nothing is polished, linted or mutation-tested before CLI-923 deletes it.

## Steps

1. **Measure lint-rules on this repo** — done 2026-10-15: [Measurement](#measurement).
2. **CLI-923** — remove the wizard (`CLI-923-spec.md`).
3. **Finish the docs cut.** `packages/cli/CLAUDE.md` to one line per rule (it loads for every agent that reads a file
   under `packages/cli`). Delete the doc-only gates: `check-finding-citations`, `check-findings-frontmatter`,
   `check-briefing-contract`, `check-enumeration-drift`. Trim what is left of `.ai-docs`.
4. **Comment purge.** Essay and dated-history comments in source and tests, one agent per directory.
5. **Lint rules, from the measurement.** Zero-violation rules on at `error`; autofix; fix rules with few violations;
   switch off high-count, low-value ones; the rest converge through the changed-lines `check` runner once lint-rules
   builds it. Delete each enforced rule's prose from `CLAUDE.md`.
6. **expressive-ts, one pass**, on source files over 800 lines.
7. **Test prune.** Tests that pin implementation rather than behaviour (the "tests survive refactor" ruling).
8. **Stryker**, scoped to `packages/compile`, `packages/matrix` and pure `cli/lib` modules. Reuse lint-rules' Stryker
   10 + vitest-runner config. Surviving mutants are a weak-test list, not a score.
9. **Skills repo**, with what budget is left.

## Census commands

- Files over 800 lines: `git ls-files 'packages/*/src' 'apps/*/src' | grep -E '\.tsx?$' | grep -vE '\.test\.|__tests__|/generated/' | xargs wc -l | awk '$1>800 && $2!="total"'`
- Comment lines vs code lines: count `//` and `/* */` lines against non-blank others over the same file list.

## Measurement

2026-10-15, lint-rules `dist` of 2026-10-14, every ruleset on, every tracked TS/JS file. Harness and raw
`results.json`: `.scratch-lint-measure/` (gitignored; `aggregate.py` reprints the summary).

| Rules by violations | Rules | Violations | Autofixable |
| ------------------- | ----: | ---------: | ----------: |
| 0                   |   742 |          0 |           0 |
| 1–10                |   147 |        526 |         142 |
| 11–100              |    81 |      2,637 |         767 |
| 101–1,000           |    30 |     10,471 |       3,773 |
| > 1,000             |    11 |     78,247 |      18,128 |

- 91,881 violations (16,790 source, 75,091 test); 22,810 autofixable (ESLint only; oxlint's JSON carries no fix data).
- `functional/*` is 56,004 of them, 51,097 in tests; `functional/no-expression-statements` alone is 43,146.
- Whole-repo run: ESLint 335 s (typed, sharded per workspace), oxlint 4.8 s. No rule crashed.

**Reading.** 970 of 1,011 rules can go on for about 2,250 hand fixes (the 1–100 tiers minus autofix). The 41 rules
over 100 hold 97% of the violations and are a style this code does not follow; each is a keep-or-off call, starting
with `functional/*` in tests. `perfectionist/sort-*` autofix reorders object keys, which can change serialised output
and snapshots, so it runs after CLI-923 with the full suite.
