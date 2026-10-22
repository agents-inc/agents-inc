---
type: anti-pattern
severity: low
affected_files:
  - ../skills/src/skills/web-data-fetching-graphql-apollo/examples/core.md
  - ../skills/src/skills/web-data-fetching-graphql-apollo/examples/fragments.md
standards_docs:
  - .ai-docs/standards/briefing.md
date: 2026-10-21
reporting_agent: skill-summoner
category: typescript
domain: infra
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  core.md create-post-form hoists the mutation result into a const before the nested posts()
  callback; fragments.md post-detail is restored to its original three lines. Compiled verbatim
  under tsc 5.9.3 and 7.0.2, the blocks print only the two undeclared-Error artefacts, with the
  mutation field nullable and non-null.
---

## What Was Wrong

Once `CREATE_POST` became a `TypedDocumentNode`, the create-post-form `update` callback read
`data.createPost` inside the nested `cache.modify` `posts()` callback. The outer
`if (!data?.createPost) return;` narrows the property path in the enclosing function only; TypeScript
drops property-path narrowing inside a nested function, so `toReference(data.createPost)` failed with
TS2345 whenever `createPost` is nullable, which is the GraphQL default.

The fix round that typed the block shipped a harness marked "written without a shell; not yet run"
whose README stated the expected output ("exactly two errors") and a negative control expecting
TS18049 for a destructured `post`. Both were predictions. Run, the harness printed a third error,
and the control printed nothing. The false TS18049 claim also justified an unneeded rewrite of
fragments.md post-detail: no closure is involved there, so `const { post } = data;` keeps the
narrowing.

## Fix Applied

Hoisted the value into a `const` before the closure (core.md); restored the original post-detail
lines (fragments.md). Replaced the TS18049 control with one that reproduces the TS2345 closure case.

## Proposed Standard

`.ai-docs/standards/briefing.md`, under reports: an expected compiler or test output written before
the command has run is labelled a prediction, and a report never cites it as a result. A negative
control counts only once a run has printed its expected code.

In skill examples, a value narrowed by a null check and then read inside a callback is hoisted to a
`const` first. That belongs in the skill-authoring standard, not in this repository's TypeScript
rules. Neither proposal conflicts with CLAUDE.md.
