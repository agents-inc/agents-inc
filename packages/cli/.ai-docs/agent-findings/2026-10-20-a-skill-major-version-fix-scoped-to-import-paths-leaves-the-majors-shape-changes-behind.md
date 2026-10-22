---
type: missing-standard
severity: medium
affected_files:
  - ../skills/src/skills/web-tooling-storybook/SKILL.md
  - ../skills/src/skills/web-tooling-storybook/reference.md
  - ../skills/src/skills/web-tooling-storybook/examples/addons.md
  - ../skills/src/skills/web-data-fetching-graphql-apollo/examples/core.md
  - ../skills/src/skills/web-data-fetching-graphql-apollo/examples/testing.md
  - ../skills/src/skills/web-data-fetching-graphql-apollo/examples/error-handling.md
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
date: 2026-10-20
reporting_agent: skill-summoner
category: typescript
domain: infra
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

SKILLS-18 described two skills whose examples demonstrated the previous major of their library, and
named the defect by its import paths: `@storybook/test`, `@storybook/blocks`, the essentials and
interactions addons, and React hooks imported from `@apollo/client` instead of
`@apollo/client/react`. Fixing those paths alone would have left each example on the old major,
because the same majors also changed call shapes that no import grep sees:

- Storybook 9: the a11y addon's `element` parameter became `context`; viewport `viewports` /
  `defaultViewport` and backgrounds `values` / `default` became `options` plus the `viewport` and
  `backgrounds` globals once the 8.3 feature flags were removed; types moved from the renderer
  package to the framework package.
- Apollo Client 4: the `onError` handler receives one `error` (no `graphQLErrors` /
  `networkError`), `ApolloClient` lost its type parameter, `MockedProvider` lost `addTypename`,
  `MockedResponse` lost `variableMatcher` (now a `request.variables` function), and
  `@apollo/client/testing/experimental` was removed.

Census, against the pre-fix build in `dist/plugins` (a census of the patterns, not of every
shape change; the a11y table cell is not matched by it):

```
grep -rcE 'graphQLErrors|networkError|addTypename|variableMatcher|ApolloClient<|testing/experimental|defaultViewport|viewports: CUSTOM|element: "|values: \[|default: "(light|dark)"' dist/plugins/{web-tooling-storybook,web-data-fetching-graphql-apollo}
```

27 hits in the six files above. A second class is not fixable by any path or shape edit: Apollo 4's
hooks have no `TData` default (v3's was `any`), so every example passing an untyped `gql` document
infers `data` as `unknown`, and blocks that compiled against v3 do not compile against v4 whatever
they import. The typing decision is recorded in
`2026-10-20-a-skill-example-typed-by-hook-type-arguments-rides-an-overload-the-library-deprecated-and-useMutation-turns-it-into-a-compile-error`.

## Fix Applied

All of the first class, in the lane that fixed SKILLS-18, each change sourced from the library's
published type declarations at the current major (storybook 10.6.3, @apollo/client 4.3.5) and its
migration notes.

## Proposed Standard

skill-atomicity-bible.md, beside "Examples must compile conceptually": when a skill moves to a new
major of its library, the checklist for its examples is the library's breaking-change list for that
major, not a search for the old package names. The atomicity bible says nothing about version
moves today, so a tracker row phrased by its symptom (imports) is the whole of what the fixer is
asked to do. The sibling finding
`2026-10-20-a-skill-example-can-pass-a-value-its-librarys-types-reject-and-nothing-compiles-it-against-the-library`
proposes the compile that would catch both classes; this one is the narrower rule for the moment a
major moves. Not checked against the skills repository's CLAUDE.md: it is gitignored and absent
from the working tree.
