---
type: convention-drift
severity: medium
affected_files:
  - ../skills/src/skills/web-server-state-react-query/examples/error-handling.md
  - ../skills/src/skills/web-error-handling-error-boundaries/SKILL.md
  - ../skills/src/skills/web-error-handling-error-boundaries/reference.md
  - ../skills/src/skills/web-error-handling-error-boundaries/examples/core.md
  - ../skills/src/skills/web-error-handling-error-boundaries/examples/recovery.md
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
date: 2026-10-20
reporting_agent: skill-summoner
category: typescript
domain: infra
root_cause: premise-expired
status: partial
partial_note: >-
  web-server-state-react-query fixed (Pattern 8 renders getErrorMessage(error)).
  web-error-handling-error-boundaries untouched, outside the lane that found it.
---

## What Was Wrong

react-error-boundary 6.1.0 changed `FallbackProps.error` from `Error` to `unknown` and exported
`getErrorMessage` (release notes, "#235: Fix error type (`Error` -> `unknown`)"). Examples written
earlier read `error.message` off it. That was correct when they were written, and it is TS18046 on
6.1.6.

The React Query skill's Pattern 8 was one of them. A lane's new `suspense.md` imports that wrapper.
The lane's typecheck project replaced the imported block with a stub carrying the same props, so the
new code compiled green over a dependency that does not compile.

Census, a pattern rather than a defect count:
`grep -rn --include='*.md' -E "fallbackRender=\{\(\{ error|FallbackProps" src/skills` in agents-inc/skills
returned 24 hits in the five files above, 23 of them in web-error-handling-error-boundaries.
`reference.md` there states "`FallbackProps` carries `error: Error`". Not every hit reads `.message`.

## Fix Applied

React Query Pattern 8 now imports `getErrorMessage` and renders `getErrorMessage(error)`, the form
the upstream README's quick start uses. The lane's typecheck project compiles the real block in
place of the stub, with react-error-boundary 6.1.6 pinned.

## Proposed Standard

skill-atomicity-bible.md, beside the compile proposal in
`2026-10-20-a-skill-example-can-pass-a-value-its-librarys-types-reject-and-nothing-compiles-it-against-the-library`:
a typecheck of a new block compiles every in-skill block it imports, verbatim. A stub with the same
signature checks the caller and none of the callee. This conflicts with nothing in CLAUDE.md's
NEVER/ALWAYS lists.
