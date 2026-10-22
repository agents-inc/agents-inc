---
type: missing-standard
severity: low
affected_files:
  - packages/cli/eslint.config.js
  - packages/eslint-config/base.js
  - packages/matrix/src/read-model/assignment-defaults.test.ts
  - packages/matrix/src/contract/selection-scenarios.ts
standards_docs:
  - CLAUDE.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-20
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The CLI-846 describe name is renamed, and the ban is now `workspace/no-task-id-in-test-text` in
  packages/eslint-config (no-task-id-in-test-text.js, on in base.js), which every workspace extends;
  the CLI's TASK_ID_SHAPES copy is gone. `bun run lint` passes in all ten workspaces. Nothing tests
  the rule itself, as with no-matcher-cast.
---

## What Was Wrong

`TASK_ID_SHAPES` in `packages/cli/eslint.config.js` refuses task ids in `describe`/`it`/`test`
names and assertion messages. It is the enforcement of `CLAUDE.md`'s rule and
`clean-code-standards.md` 6.11. Both the rule and the lint are scoped to `packages/cli`, and
`@workspace/eslint-config/base` carries neither. As a result,
`describe("CLI-846: the meta-flavor agents are inside the default system", …)` in
`packages/matrix/src/read-model/assignment-defaults.test.ts` passed the matrix lint. A comment
purge and a test prune both read that file, and neither removed it.

Reproduction, run from `packages/matrix` against the pre-fix text:

```
RULE='no-restricted-syntax: [error, {selector: "CallExpression[callee.name=/^(describe|it|test)$/] > Literal[value=/\\b(D|R|P\\d*|CLI|REPO|WWW|ED|SRV)-\\d+\\b/]", message: "task id"}]'
git show HEAD:packages/matrix/src/read-model/assignment-defaults.test.ts | npx eslint --stdin --stdin-filename src/read-model/assignment-defaults.test.ts --rule "$RULE"
# 685:10 error task id   (rc=1)
git show HEAD:packages/matrix/src/read-model/assignment-defaults.test.ts | npx eslint --stdin --stdin-filename src/read-model/assignment-defaults.test.ts
# rc=0
```

A second gap of the same kind: the comment rule reaches comments, and this lint reaches test names
and assertion messages. A free-text data field that nothing reads is neither. `SelectionScenario.why`
in `packages/matrix/src/contract/selection-scenarios.ts` carried five dated-history sentences (two
of them with `CLI-389`), and neither gate could see them.
`2026-10-20-a-tracker-id-survives-as-a-field-name-where-no-task-id-ban-reaches` covers the same
gap for identifiers.

## Fix Applied

Removed the `CLI-846: ` prefix from the test name, and deleted the history sentences from the five
`why` strings. Census of test names across every workspace after the fix:

```
grep -rnE '\b(describe|it|test)\(\s*["'"'"'`][^"'"'"'`]*\b(D|R|P[0-9]*|CLI|REPO|WWW|ED|SRV)-[0-9]+\b' apps packages --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=dist
```

The only hit is fixture text inside `source-folder-literals-are-funnelled.test.ts`, which is a
string passed as input, not a test name.

## Proposed Standard

Move `TASK_ID_SHAPES` into `@workspace/eslint-config/base` and drop the copy in
`packages/cli/eslint.config.js`, so every workspace inherits it. Nothing mechanical is proposed for
free-text data fields. Read a field that no runner reads as a comment.
