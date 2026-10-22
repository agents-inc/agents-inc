---
type: standard-gap
severity: low
affected_files:
  - packages/cli/eslint.config.js
  - packages/compile/src/contract/emission-scenarios.test.ts
  - packages/compile/src/config-source.ts
  - packages/compile/src/config-source.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-20
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The compile instances are fixed, and `workspace/no-task-id-in-test-text` in
  packages/eslint-config reads a literal, concatenated or templated `expect` message in every
  workspace (eslint --stdin: each reports, a plain message does not). Nothing tests the rule itself.
---

## What Was Wrong

`TASK_ID_SHAPES` in `packages/cli/eslint.config.js` refuses a task ID in an assertion message with
`CallExpression[callee.name='expect'] > Literal[...]`. That matches a message that is one literal,
and the house style for a message over 100 columns is `"..." + "..."`, which is a
`BinaryExpression`. `emission-scenarios.test.ts` carried `This is NOT CLI-841` in such a message.
It would have passed the CLI's lint as well. The lint does not run in `packages/compile` anyway,
which is the gap `2026-10-20-the-task-id-lint-on-test-names-runs-only-in-the-cli-so-a-matrix-describe-carried-one-past-every-gate`
records. Its census grepped test names only, so it did not reach this message.

Reproduction, from `packages/compile` against the pre-fix text:

```
F=src/contract/emission-scenarios.test.ts
CHILD='no-restricted-syntax: [error, {selector: "CallExpression[callee.name='"'"'expect'"'"'] > Literal[value=/\\b(D|R|P\\d*|CLI|REPO|WWW|ED|SRV)-\\d+\\b/]", message: "task id"}]'
DESC='no-restricted-syntax: [error, {selector: "CallExpression[callee.name='"'"'expect'"'"'] > BinaryExpression Literal[value=/\\b(D|R|P\\d*|CLI|REPO|WWW|ED|SRV)-\\d+\\b/]", message: "task id"}]'
git show HEAD:packages/compile/$F | npx eslint --stdin --stdin-filename $F --rule "$CHILD"   # rc=0
git show HEAD:packages/compile/$F | npx eslint --stdin --stdin-filename $F --rule "$DESC"    # 110:9 error task id, rc=1
```

A second string had the same standing. The error `generateProjectConfig` throws said "the
standalone writer this used to fall through to", which is history in user-facing text, and
`config-source.test.ts` asserted it. No rule covers history in an error message. The comment purge
read both strings as code. The test prune read them as not pinning the implementation. So neither
stage removed them.

## Fix Applied

Deleted the ticket sentence from the assertion message, and the history clause from the error and
from its assertion. The assertion now matches the whole error with `toThrow(new Error(...))`. A
string argument is a substring match, which the shortened message would have satisfied against the
old text. It failed first. Census of continuation lines carrying an ID in test files, across every
workspace (it finds line 110 in the HEAD text):

```
grep -rnE "^\s*[\"'\`].*\b(D|R|P[0-9]*|CLI|REPO|WWW|ED|SRV)-[0-9]+\b.*[\"'\`]\s*(\+|,|\))?\s*$" apps packages --include='*.test.ts' --include='*.test.tsx' --exclude-dir=node_modules --exclude-dir=dist
```

After the fix it returns nothing.

## Proposed Standard

Add `CallExpression[callee.name='expect'] > BinaryExpression Literal[...]` and
`CallExpression[callee.name='expect'] > TemplateLiteral TemplateElement[...]` to `TASK_ID_SHAPES`,
and carry them into `@workspace/eslint-config/base` when the related finding's move lands. The
`describe`/`it`/`test` selectors have the same lone-literal shape. When a brief splits a sweep into
comments and tests, it should say which stage owns string literals (error text and assertion
messages). No conflict with `CLAUDE.md`. This enforces its existing ban on IDs in assertion
messages.
