---
type: anti-pattern
severity: low
affected_files:
  - src/cli/components/wizard/wizard-tabs.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-07-09
reporting_agent: cli-developer
category: dry
domain: web
root_cause: convention-undocumented
status: resolved
resolved_by: Removed the erroneous marginBottom={3} from the hoisted inline DomainNav wrapper in wizard-tabs.tsx; hoisted build step now shows a single blank line before the skills grid, matching every other wizard step.
---

## What Was Wrong

The wizard tab bar reserves vertical space for a dropdown/sub-nav that renders under the
active tab. In the **non-hoisted** path the dropdown is `position: "absolute"` (removed from
document flow), so the tab-bar `Box` carries `marginBottom={3}` to reserve exactly the 3 rows
the absolute dropdown overlaps into (border-top + content + border-bottom). The subsequent
`marginTop={1}` on the step-content box in `wizard-layout.tsx` then produces a single blank
line between the dropdown and the content — the intended, consistent spacing on every step.

The **hoisted** path (triggered when domain labels exceed `DOMAIN_NAV_CHAR_THRESHOLD`, e.g.
"Web API CLI Infrastructure Meta Shared") renders the same nav **inline, in normal document
flow**, and its wrapper carried a copied-over `marginBottom={3}`. In normal flow the inline
nav already occupies its own 3 rows, so that reservation was pure dead space: it stacked 3
extra blank rows on top of the nav's own height, plus the shared `marginTop={1}`, producing
**4 blank lines** before the skills grid instead of 1 — visibly inconsistent with every other
step and with the non-hoisted build step.

Root of the bug: the magic number `3` encodes "the absolute dropdown's rendered height, to be
reserved in flow." That semantic only holds for an out-of-flow element. It was duplicated onto
an in-flow element where the same number means "add 3 literal blank rows," so it double-counts.

Verified by rendering `WizardTabs` through `ink-testing-library` for all six steps
(stack, domains, build non-hoisted, build hoisted, sources, agents, confirm): only the hoisted
build case deviated (4 blank lines vs 1 everywhere else).

## Fix Applied

Removed `marginBottom={3}` from the hoisted `DomainNav` wrapper `<Box>` in `wizard-tabs.tsx`.
The wrapper `<Box>` is retained (with no props) so the inline dropdown keeps hugging its
content width instead of stretching to full terminal width — dropping the wrapper entirely made
the nav a direct child of the column-flex parent, which stretched its border to full width and
was a separate visual regression. Post-fix, all six steps render exactly one blank line between
the dropdown/nav and the step content. No test asserted on this spacing, so no test changes
were needed.

## Proposed Standard

Two ideas, either would prevent recurrence:

1. **Name the magic number.** The `3` in `wizard-tabs.tsx` is "dropdown box height =
   border-top + content + border-bottom." Extract it to a named constant (e.g.
   `DROPDOWN_RESERVED_ROWS`) with a comment stating it is a _reserve for the absolutely-
   positioned dropdown only_. A named, documented constant makes it obvious the value is tied
   to out-of-flow layout and must not be reused as a literal margin on in-flow elements.

2. **Document the reserved-space pattern.** Add a short note to
   `.ai-docs/reference/component-patterns.md` (wizard tab-bar section) explaining that the
   tab-bar `marginBottom` reserves space for the absolute dropdown, that the per-step content
   `marginTop={1}` in `wizard-layout.tsx` supplies the single intended blank line, and that any
   inline (hoisted) variant of the nav must NOT re-apply the reserve — it is already in flow.
