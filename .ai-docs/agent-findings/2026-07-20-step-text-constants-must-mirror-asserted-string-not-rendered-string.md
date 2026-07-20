---
type: missing-standard
severity: medium
affected_files:
  - e2e/pages/constants.ts
  - e2e/commands/uninstall.e2e.test.ts
  - e2e/interactive/uninstall.e2e.test.ts
  - e2e/interactive/init-wizard-sources.e2e.test.ts
  - e2e/interactive/init-wizard-plugin.e2e.test.ts
  - e2e/lifecycle/plugin-lifecycle.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
---

## What Was Wrong

CLAUDE.md requires E2E tests to pull all UI text from `STEP_TEXT` in `e2e/pages/constants.ts`
rather than inlining literals. It does not say which string the constant must hold when the
literal a test asserts is only a _prefix_ of what the product actually renders. That gap makes a
literal-to-constant sweep silently unsafe in both directions.

Two concrete cases found while auditing the E2E tree:

1. `STEP_TEXT.INSTALLING_PLUGINS` holds `"Installing skill plugins"`, but `src/cli/commands/init.tsx`
   renders `"Installing skill plugins..."`. Four spec sites assert the ellipsis form positively and
   one asserts the bare form negatively (`.not.toContain`). Pointing all five at a single constant
   requires either shortening the constant (weakening the four positive assertions to a prefix
   match) or lengthening it (weakening the negative assertion, which currently rejects a strictly
   larger set of outputs).

2. `src/cli/commands/uninstall.tsx` renders `"The following will be removed:"` with a trailing
   colon. One spec site asserts that exact string; two others wait on the colon-less prefix. A
   single constant again forces one group's assertion to change.

The same prefix divergence exists for `"Configured marketplaces"` (spec) vs
`"Configured marketplaces:"` (`step-settings.tsx`) and `"Add source"` (spec) vs `"+ Add source:"`
(`step-settings.tsx`).

A separate, related case: `"Framework"` is both the build-step sentinel (`STEP_TEXT.BUILD`) and a
category _label argument_ passed to `build.getExclusiveCategorySelectedCount(...)`. Three spec files
had each re-declared it locally as `const FRAMEWORK_CATEGORY_LABEL = "Framework"` rather than reuse
`STEP_TEXT.BUILD`, because reusing a step sentinel as a data argument reads wrong even though the
values match.

## Fix Applied

Extended `STEP_TEXT` so every distinct asserted string is expressible, without altering any
existing entry:

- Added `INSTALLING_PLUGINS_ELLIPSIS` alongside the unchanged `INSTALLING_PLUGINS`.
- Added `UNINSTALL_PREVIEW` (loose form, for `waitForText`) and `UNINSTALL_PREVIEW_HEADING`
  (exact rendered heading).
- Added `CONFIGURED_MARKETPLACES`, `ADD_SOURCE`, `LOADED_SKILL`, `COMPILED_LIST` matching the
  strings the specs assert today.
- Added `CATEGORY_FRAMEWORK` with a comment marking it as a category-label argument, distinct in
  role from the `BUILD` step sentinel that shares its value.

No spec file was edited; adoption is a later phase.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md`, in the constants section:

> A `STEP_TEXT` entry holds the string a test asserts, byte for byte — not the string the product
> renders. When specs assert a prefix at some sites and the full rendered string at others, add a
> second entry rather than reconciling them; lengthening a constant weakens negative assertions and
> shortening one weakens positive assertions. Name the pair `X` (loose) and `X_<QUALIFIER>` (exact),
> and comment which is which.
>
> Two entries may share a value when their _roles_ differ — a step sentinel passed to
> `waitForText` is not the same thing as a category label passed as a function argument, even when
> both are `"Framework"`. Prefer a second named entry over reusing a sentinel as data, and over a
> local `const` in a spec file.
