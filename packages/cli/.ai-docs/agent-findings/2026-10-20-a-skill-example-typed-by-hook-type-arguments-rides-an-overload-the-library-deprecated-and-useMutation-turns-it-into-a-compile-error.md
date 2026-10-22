---
type: convention-drift
severity: medium
affected_files:
  - ../skills/src/skills/web-data-fetching-graphql-apollo/SKILL.md
  - ../skills/src/skills/web-data-fetching-graphql-apollo/examples/suspense.md
  - ../skills/src/skills/web-data-fetching-graphql-apollo/examples/core.md
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
date: 2026-10-20
reporting_agent: skill-summoner
category: typescript
domain: infra
root_cause: premise-expired
status: resolved
resolved_by: >-
  S2-skills-18-fix annotated each document as TypedDocumentNode<Op, OpVariables> and dropped the hook
  type arguments at all four sites. S2-skills-18-fix-2 compiled the blocks verbatim under tsc 5.9.3
  and 7.0.2 against @apollo/client 4.3.5, after fixing the one closure-narrowing error the typing
  exposed; see 2026-10-21-a-null-check-on-a-property-path-does-not-narrow-it-inside-a-nested-callback-and-a-harness-predicted-its-output-unrun.md.
---

## What Was Wrong

The Apollo skill typed its hooks with type arguments, `useQuery<GetUserQuery, GetUserQueryVariables>(...)`.
That was the common v3 shape. In @apollo/client 4.3.5 every overload that accepts explicit type
arguments on `useQuery`, `useLazyQuery`, `useMutation`, `useSuspenseQuery`, `useLoadableQuery` and
`useBackgroundQuery` is `@deprecated` ("Avoid manually specifying generics ... rely on ... a
correctly typed `TypedDocumentNode`"), the 4.2 CHANGELOG says the same, and the TypeScript docs page
heads its example "Don't provide generic arguments to Apollo Client APIs".

The review of the lane before this one proposed extending that convention to the untyped blocks.
On `useMutation` it does not compile: the inferring overload has three required type parameters, so
two explicit arguments select the deprecated overload, whose `TConfiguredVariables` defaults to `{}`,
and the variables passed to the hook stay required at the mutate call. `createPost()` and
`deletePost()` in core.md would each be TS2554. Matching the file's existing convention would have
carried a deprecated shape forward and broken two blocks.

Census, the pre-fix build (a census of explicit hook type arguments in this skill):
`grep -rnE 'use(Query|LazyQuery|Mutation|Subscription|SuspenseQuery|LoadableQuery|BackgroundQuery)<' dist/plugins/web-data-fetching-graphql-apollo`
in agents-inc/skills returned 4 hits in the 3 files above. The same grep over `src/skills` also hits
the urql and PowerSync skills, whose libraries document that form; it is not a defect there.

## Fix Applied

Each document is annotated `TypedDocumentNode<Op, OpVariables>` with types from codegen, and the
hooks infer from it. SKILL.md Pattern 2 says to type the document rather than the hook.

## Proposed Standard

skill-atomicity-bible.md, beside "Examples must compile conceptually": before a fix copies the
shape an example already uses, read that overload in the library's published declarations at the
pinned version. A `@deprecated` tag on it means the convention has expired, whatever the file
around it does. Not checked against the skills repository's CLAUDE.md: it is gitignored and absent
from the working tree. Conflicts with nothing in this repository's CLAUDE.md NEVER/ALWAYS lists.
