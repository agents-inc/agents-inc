---
type: convention-drift
severity: low
affected_files:
  - packages/matrix/src/vendor/generated/matrix.ts
  - packages/matrix/src/read-model/preload-defaults.test.ts
standards_docs:
  - .ai-docs/reference/features/skills-and-matrix.md
date: 2026-08-06
reporting_agent: cli-developer
category: architecture
domain: shared
root_cause: convention-undocumented
status: open
---

## What Was Wrong

Every framework category in the catalog is named `<domain>-framework` — `web-framework`,
`web-meta-framework`, `cli-framework`, `desktop-framework`, `mobile-framework`, `api-framework` —
except that four of the five API frameworks are not in `api-framework` at all. Express, Fastify,
Hono and NestJS carry `category: "api-api"` (displayName "API Framework", `exclusive`, `required`),
and only Elysia sits in `api-framework`. The ids are consistent (`api-framework-express`); the
categories are not.

Anything that asks "is this skill a framework?" by matching the category — the obvious rule, since
the catalog is the authority on categories — silently answers no for four of the five API
frameworks. The reviewer-column thinning pass hit this the first time it ran: a pin written as
`categoryId.endsWith("framework")` reported Express, Fastify, Hono and NestJS as non-framework
skills that should not preload on the reviewer, which is the opposite of the truth.

## Fix Applied

The pin names the categories instead of matching them: `FRAMEWORK_CATEGORIES` in
`packages/matrix/src/read-model/preload-defaults.test.ts` is an explicit set including `api-api`,
with a comment saying why. That is a test-local workaround, not a fix — the data is still spelled
two ways, and the next rule about frameworks will meet the same trap.

## Proposed Standard

Either rename the upstream `api-api` category to `api-framework` and move its four skills (the
category id reaches config files, so this is a migration, not a rename), or state in
`skills-and-matrix.md` that category ids are NOT a reliable way to ask what kind of skill something is
and name the one exception. Whichever way it goes, a helper — `isFrameworkCategory(categoryId)` in
`packages/matrix/src/read-model/` — would give the question one answer instead of one per caller.
