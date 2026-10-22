---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/e2e/specs/accounts.spec.ts
  - apps/editor/e2e/specs/card-outline.spec.ts
  - apps/editor/e2e/specs/codex-provider.spec.ts
  - apps/editor/e2e/specs/design-tokens.spec.ts
  - apps/editor/e2e/specs/domain-tabs.spec.ts
  - apps/editor/e2e/specs/output-preview.spec.ts
  - apps/editor/e2e/specs/preview-matches-install.spec.ts
  - apps/editor/e2e/specs/roster.spec.ts
  - apps/editor/e2e/specs/search-filter.spec.ts
  - apps/editor/e2e/specs/skill-badges.spec.ts
  - apps/editor/e2e/specs/skill-contents.spec.ts
  - apps/editor/e2e/specs/skill-options.spec.ts
  - apps/editor/e2e/specs/skill-selection.spec.ts
  - apps/editor/e2e/specs/step-collapse.spec.ts
  - apps/editor/e2e/specs/step-titles.spec.ts
  - apps/editor/e2e/specs/sticky-bar.spec.ts
  - apps/editor/e2e/specs/sub-agent-cards.spec.ts
  - apps/editor/e2e/specs/theme.spec.ts
  - apps/editor/e2e/pages/configure-page.ts
  - apps/editor/e2e/pages/dialogs.ts
  - apps/editor/e2e/pages/roster-panel.ts
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-10-20
reporting_agent: web-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  REPO-44 step 7 (W5-editor-e2e). The assertions now read what is painted or reachable:
  `ConfigurePage.strokes()` for a line wherever it is drawn, `ConfigurePage.paintsWith()` for a
  paint in a token (photographed with the token transparent), bounding boxes for spacing and
  columns, keyboard walks for tab stops, `aria-current` for the current domain, the first category
  for where a domain starts, and literal ids in place of the app's own helpers. Five tests whose
  behaviour another test covers were deleted.
---

## What Was Wrong

The editor's Playwright specs asserted how the page is built rather than what it shows. Each of
these reddens on a change that draws the same pixels another way:

- `roster.spec.ts`: the pulse as `toHaveClass(/bg-flash/)` and `/hover:bg-roster-hover/`. With
  `.bg-flash { background-color: transparent }` injected, the class is still on the row and the old
  assertion passes with nothing painted.
- The card line as `getComputedStyle(cell, "::after")` content and `outlineWidth`
  (`card-outline.spec.ts`, `sub-agent-cards.spec.ts`, `codex-provider.spec.ts`), and the rail rule
  as `::before` height (`accounts.spec.ts`). Moving the line to the cell's own outline turns
  `::after` content to `none`.
- Focus rings as `boxShadow` containing the ring colour, and a ring removed by setting Tailwind's
  private `--tw-ring-color`. As an outline, `boxShadow` reads `none` and the old check fails.
- Hairlines as an inset `box-shadow` string (`sticky-bar.spec.ts`).
- Columns as `gridTemplateColumns.split(" ").length`. Under `display: flex` that read gives 3 for
  a four-across grid.
- Spacing as the computed `marginTop` / `marginBottom` / input `paddingLeft`.
- Tab stops as `tabindex="0"` / `"-1"`; the current domain as the styling hook `[data-active]`;
  the theme as `data-theme`; where a domain starts as the app's own `[data-domain-anchor]`; the
  pinned bar as its zero-height sentinel; the rail as `.rail-scrollbar`.
- `output-preview.spec.ts` compared the screen to `buildOutputPreview()` imported from `@/`, and
  two specs built ids with `externalSkillId()` from `@/`. A rename breaks the import, and a
  format change moves both sides of the comparison together.

Census, from `apps/editor`:

```
grep -rnE 'toHaveClass|--tw-|::after|::before|boxShadow|gridTemplateColumns|marginTop|tabindex|data-active|data-theme|data-domain-anchor|pin-sentinel|rail-scrollbar|from "@/' e2e
```

Before the change this returned hits in the affected files above. After it, 8 hits remain and none
is an assertion on a mechanism. Six are the code and comments of three helpers that scan every
layer a paint could be on: `ConfigurePage.strokes()`, `accounts.spec.ts`'s `rulesOn` and
`sub-agent-cards.spec.ts`'s `bar()`. One is `codex-provider.spec.ts`'s `paintOf`, a
before-and-after snapshot of every paint. One is a comment in `visual.spec.ts`.

## Fix Applied

Each assertion now reads the result: one stroke wherever it is drawn (`strokes()`), a paint in a
token reaching the screen (`paintsWith()`, photographed with `--<token>` and `--color-<token>`
transparent on the element), boxes for gaps and columns, a keyboard walk across both edges of the
group that lands on the chosen item coming in for a single stop, `[aria-current="true"]`, the first
category group for a domain's start, body colour for the theme, and written-out ids.

- The redrawn form passes: the line as the cell's own outline, the ring as an outline, the band
  edge and the strip hairline as borders, the grid as flex, the input's padding moved to the field,
  the rule on `::after`, and the contents body wrapped in `<code>`.
- The broken form fails: a second border, the ring removed, three columns, the pulse painting
  nothing, `eject` made a tab stop, every radio's stop removed, a stop left on the effort level
  before the checked one, a frozen `data-theme`, parsed markup in the contents body, and a stray
  anchor on the sub-agent group (the gap read 33px).

Deleted, each named with the test that covers it, in the REPO-44 W5 report.

## Proposed Standard

`apps/editor/e2e/README.md` › Conventions, beside "Locate by role": **assert what is painted,
never how.** A line or ring goes through `strokes()` or `paintsWith()`, spacing and columns through
bounding boxes, a tab stop through a keyboard walk that crosses the group's edge on both sides and
comes in onto the chosen item at least once: out by Tab and by Shift+Tab with a way back in, or in
by Tab from the control before and out by Tab. A walk across one edge only misses a second stop on
the other side, and one that never comes in misses a group with no stop at all. A spec does not
assert a class name, a Tailwind variable, which property or pseudo-element draws something, or
an attribute the app's own code reads. A test-only hook that names state (`data-glyph`,
`data-filled`, `data-bar-stuck`) is a test contract and may be asserted. This does not conflict
with `CLAUDE.md`. It is the owner's 2026-08-26 refactor-survival ruling applied to Playwright.
