---
type: missing-standard
severity: medium
affected_files:
  - e2e/fixtures/expected-values.ts
  - e2e/lifecycle/dual-scope-same-source-plugin.e2e.test.ts
  - e2e/lifecycle/dual-scope-in-session-collapse-restore-sequence.e2e.test.ts
  - e2e/lifecycle/edit-remove-skill-stack-surgical.e2e.test.ts
  - e2e/lifecycle/init-edit-compile-roundtrip.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-20
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: convention-undocumented
status: partial
partial_note: "Inverted relative to the enum's documented direction — the CODE side landed and the DOCS side did not. Landed: the category-1 and category-2 adoptions in the four owned spec files. Pending: the proposed standard, which is the load-bearing half here because the finding is explicitly about an UNSTATED boundary. Verified 2026-07-30 that `standards/e2e/test-data.md` names `E2E_SKILL` / `E2E_AGENT_DISPLAY` only in its inventory tables and states no rule for picking `.id` vs `.slug` vs `.display` by what the call site consumes, and no rule on when a spec-local skill constant is still acceptable — so the category-3 constants the finding deliberately left in place remain unadjudicated."
---

## What Was Wrong

`E2E_SKILL` in `e2e/fixtures/expected-values.ts` exposes three forms per skill (`.id`, `.slug`,
`.display`) precisely because the same skill is addressed differently depending on the call site:
config assertions use the id, source-path lookups use the slug, and page-object methods that match
on rendered terminal text (`selectSkill`, `focusSkill`, `getScopeBadgesForSkill`) use the display
title. For most E2E-source skills all three strings happen to be equal, so the distinction is
invisible until a skill's `displayName` diverges from its id — as it already has for
`vue-composition-api` ("Vue Composition Api") and the `meta-*` skills.

Spec files currently hold three different local shapes with no rule saying which should be replaced:

1. Pure label constants that exist only to feed a text-matching page-object call
   (`const HONO_LABEL = "api-framework-hono"` sitting next to an identical
   `const HONO_ID`, in `dual-scope-same-source-plugin.e2e.test.ts`).
2. Bare literals passed straight into a text-matching call
   (`wizard.build.focusSkill("web-framework-react")` in `init-edit-compile-roundtrip.e2e.test.ts`).
3. General-purpose constants used for BOTH config data and a text-matching call
   (`REACT_SKILL_ID`, `ZUSTAND`, `VITEST_ID`).

Category 3 has no safe mechanical rewrite. CLAUDE.md bans `const REACT = E2E_SKILL.react.id`
("NEVER reassign constants to other constants"), so the only adoption available is inlining
`E2E_SKILL.react.id` at every use — 8-10 sites per file — and where the same constant also feeds a
`selectSkill()` call it would have to be split across `.id` and `.display` mid-file. Both outcomes
are less readable than the local constant, which is the opposite of what the expressive-TypeScript
pass is for.

## Fix Applied

Adopted `E2E_SKILL` for categories 1 and 2 only, in the four owned files:

- Deleted `HONO_LABEL` and `VITEST_LABEL` (exact duplicates of `HONO_ID` / `VITEST_ID`) and routed
  their `focusSkill` / `getScopeBadgesForSkill` / `selectSkill` call sites through
  `E2E_SKILL.hono.display` and `E2E_SKILL.vitest.display`.
- Replaced the bare `focusSkill("web-framework-react")` literal with `E2E_SKILL.react.display`.
- Left category-3 constants (`REACT_SKILL_ID`, `REACT`/`VITEST`/`ZUSTAND`, `HONO_ID`, `VITEST_ID`)
  in place and reported them rather than splitting them.

Also adopted `E2E_AGENT_DISPLAY["api-developer"]` for the bare `toggleAgent("API Developer")`
literal in `scope-toggle-agent-content.e2e.test.ts`.

## Proposed Standard

Add to `.ai-docs/standards/e2e/README.md`, in the test-data/fixtures section:

> **Addressing E2E-source skills and agents.** Use `E2E_SKILL` / `E2E_AGENT_DISPLAY` from
> `e2e/fixtures/expected-values.ts` whenever a spec names a skill or agent that the E2E source
> writes. Pick the field by what the call site consumes, never by convenience:
> `.display` for anything the wizard renders and page objects match on (`selectSkill`,
> `focusSkill`, `getScopeBadgesForSkill`, `toggleAgent`, `navigateCursorToAgent`); `.id` for
> config assertions and factory input; `.slug` for source paths. Do not normalise the three forms
> to one — they are only coincidentally equal for most E2E skills.
>
> Do NOT create a spec-local alias (`const REACT_ID = E2E_SKILL.react.id`) — CLAUDE.md bans
> constant-to-constant reassignment. A spec-local skill constant is acceptable ONLY when the same
> string is reused many times for config data within one file; in that case keep the constant and
> keep any text-matching call in the same file on the constant too, so a single file never mixes
> the two conventions for one skill. Never declare two local constants with the same skill string
> (an `_ID` and a `_LABEL`) — that duplication is what `E2E_SKILL` exists to remove.
> </content>
> </invoke>
