---
type: missing-standard
severity: medium
affected_files:
  - packages/cli/.ai-docs/standards/briefing.md
standards_docs:
  - .ai-docs/standards/briefing.md
date: 2026-10-26
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: missing-rule
status: open
---

## What Was Wrong

CLI-938's lane gate was `npx turbo run lint typecheck test --filter=agents-inc --force`. In fix
round 1, other lanes' specs failed in `test`. turbo's `--continue` defaults to `never`, which turbo
2.10.8's own `--help` describes as "cancel all tasks". So `lint` was cancelled before it printed a
result. Its section was one line, `agents-inc:lint: $ eslint .`, and nothing came after it.

eslint prints nothing on success, so that blank section reads exactly like a pass. The developer
reported lint as passing. Review then ran `npx eslint .` and got 2 errors, both in the lane's own
file.

The summary names only the failed task: `Tasks: 13 successful, 15 total` / `Failed:
agents-inc#test`. The cancelled task appears nowhere in it. The only sign is the arithmetic: 13
succeeded plus 1 failed leaves one task unaccounted for.

## Fix Applied

None to tooling. In fix round 2, the same gate was run with `--continue`. It reported `Tasks: 14
successful, 15 total` / `Failed: agents-inc#test`, so lint and typecheck both finished. The failures
in `test` were other lanes' specs.

## Proposed Standard

In `briefing.md` › "What a brief must contain", the **Gates** row: where one turbo run carries more
than one task, the brief passes `--continue`. The report reads each task's result from the summary
arithmetic, never from a blank section. This is the same class as the owner's "gate output must be
visible" rule, which is not yet in the tree.

Not proposed: `--continue` in `.husky/pre-commit`. A hook's non-zero exit blocks the commit
whichever task failed, so a cancelled sibling there hides a second failure but never passes one.
