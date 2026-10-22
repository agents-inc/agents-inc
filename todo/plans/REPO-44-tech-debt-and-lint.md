# REPO-44 — tech debt and the lint-rules rollout

Owner 2026-10-15. Order matters: nothing is polished, linted or mutation-tested before CLI-923 deletes it.

## Steps

1. **Measure lint-rules on this repo** — done 2026-10-15: [Measurement](#measurement).
2. **CLI-923** — remove the wizard: done 2026-10-15 (0.169.0).
3. Removed (owner, 2026-10-20): how to reduce `packages/cli/CLAUDE.md` and `.ai-docs` is decided separately, later.
   That holds step 5's prose deletion too.
4. **Comment purge.** Essay and dated-history comments in source and tests, one agent per directory. Done 2026-10-21.
5. **Lint rules, from the measurement.** Zero-violation rules on at `error`; autofix; fix rules with few violations;
   switch off high-count, low-value ones; the rest converge through the changed-lines `check` runner once lint-rules
   builds it. Delete each enforced rule's prose from `CLAUDE.md`. Also (owner, 2026-10-19): sweep the unused exports
   `bun run deps:dead` lists, and a lint rule against matcher casts in tests (`expect.any(String) as unknown`).
   2026-10-20: the measured rules wait for the lint-rules package run against this repo (owner: not yet); the
   deps:dead sweep, the matcher-cast rule and the `fast-glob` import ban landed 2026-10-21.
6. **expressive-ts, one pass**, on source files over 800 lines: done 2026-10-21. Then (owner, 2026-10-21, after a pause): several
   rounds over the whole repo and lint-rules, a different focus each, queued behind the running work.
7. **Test prune.** Tests that pin implementation rather than behaviour (the "tests survive refactor" ruling). Split
   the test files that mix source-reading tests with others, so the rest rejoin mutation runs, then shrink
   `READS_SOURCE_TEXT` in `packages/cli/vitest.mutation.config.ts`. Done 2026-10-21.
8. **Stryker** ran early, in 0.170.2, over all eight workspaces with this repo's own root configs
   (`stryker.config.json`, `stryker.workspace.mjs`, `stryker.*.config.mjs`); how to run it: `docs/architecture.md` ›
   Mutation testing. Re-run on the lines steps 4-7 changed: done 2026-10-21. Surviving mutants are a weak-test list, not a score.
9. **Skills repo**, with what budget is left.

## Census commands

- Files over 800 lines: `git ls-files 'packages/*/src/*' 'apps/*/src/*' | grep -E '\.tsx?$' | grep -vE '\.test\.|__tests__|/generated/' | xargs wc -l | awk '$1>800 && $2!="total"'`
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
