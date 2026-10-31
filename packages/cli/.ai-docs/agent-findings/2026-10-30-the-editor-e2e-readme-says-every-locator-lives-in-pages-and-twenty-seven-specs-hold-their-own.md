---
type: convention-drift
severity: low
affected_files:
  - apps/editor/e2e/README.md
  - apps/editor/e2e/specs/accounts.spec.ts
  - apps/editor/e2e/specs/add-skill.spec.ts
  - apps/editor/e2e/specs/card-outline.spec.ts
  - apps/editor/e2e/specs/catalog-first.spec.ts
  - apps/editor/e2e/specs/category-header.spec.ts
  - apps/editor/e2e/specs/codex-provider.spec.ts
  - apps/editor/e2e/specs/composer.spec.ts
  - apps/editor/e2e/specs/design-tokens.spec.ts
  - apps/editor/e2e/specs/domain-tabs.spec.ts
  - apps/editor/e2e/specs/external-skills.spec.ts
  - apps/editor/e2e/specs/filters.spec.ts
  - apps/editor/e2e/specs/install-dialog.spec.ts
  - apps/editor/e2e/specs/marketplace.spec.ts
  - apps/editor/e2e/specs/roster.spec.ts
  - apps/editor/e2e/specs/search-filter.spec.ts
  - apps/editor/e2e/specs/shared-link.spec.ts
  - apps/editor/e2e/specs/sharing.spec.ts
  - apps/editor/e2e/specs/skill-badges.spec.ts
  - apps/editor/e2e/specs/skill-contents.spec.ts
  - apps/editor/e2e/specs/skill-options.spec.ts
  - apps/editor/e2e/specs/skill-selection.spec.ts
  - apps/editor/e2e/specs/step-collapse.spec.ts
  - apps/editor/e2e/specs/step-titles.spec.ts
  - apps/editor/e2e/specs/sticky-bar.spec.ts
  - apps/editor/e2e/specs/sub-agent-cards.spec.ts
  - apps/editor/e2e/specs/theme.spec.ts
  - apps/editor/e2e/specs/visual.spec.ts
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-10-30
reporting_agent: web-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`apps/editor/e2e/README.md` (the `pages/` row of its layout table) says page objects hold "all
locators … never in a spec". Census, 2026-10-30, lines not calls:

```
grep -rnE '\.locator\(|getByRole\(|getByText\(|getByLabel\(|getByTestId\(' apps/editor/e2e/specs | wc -l
grep -rlE '\.locator\(|getByRole\(|getByText\(|getByLabel\(|getByTestId\(' apps/editor/e2e/specs
```

110 lines in the 27 files listed above. Some are scoped queries on a page object's locator inside
an assertion (`body.locator(THE_FILES_TAGS)` in skill-contents.spec.ts); the rest are spec-owned
locators. Nothing enforces the rule, so it reads as held and is not.

The shape that grew it in this programme: a lane that could not edit `pages/dialogs.ts` (another
chain's file) wrote the locator inline with a comment "Belongs in … which another lane holds". The
locator stayed correct; the comment went false the moment the lanes ended. A narrower, earlier
finding names one other cause (a page object modelling only a control's resting state):
`2026-09-02-a-page-object-modelling-only-a-controls-resting-state-pushes-every-lifecycle-locator-into-the-specs`.

## Fix Applied

Lane EDITOR-PAGE-OBJECTS moved the two locators EDITOR-58 reported: `SkillContentsDialog.textPane`
and `InstallDialog.lists` (the "Skills and agents" region) in `pages/dialogs.ts`. a11y.spec.ts and
skill-contents.spec.ts now use them, and their three "another lane holds" comments are gone. The
other 26 files are untouched.

## Proposed Standard

Either make the README's sentence true or narrow it. Narrowing (for example "locators a second spec
would need live in pages/") is a wording change only. Making it true needs a lint rule in
`apps/editor/eslint.config.js` scoped to `e2e/specs/**` (a `no-restricted-syntax` on
`MemberExpression[property.name=/^(locator|getBy[A-Z]\w*)$/]`) plus a sweep of the 27 files. That is
an owner choice and is not made here. Unchecked: whether any of the 110 lines duplicates a locator a
page object already has.
