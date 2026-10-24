---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/components/common/summary-panel.test.tsx
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-23
reporting_agent: cli-tester
category: testing
domain: web
root_cause: missing-rule
status: resolved
resolved_by: >-
  summary-panel.test.tsx's header and summary blocks now read summaryPanelText at 100 columns, the
  width their live mount drew at; the header snapshot and every assertion are unchanged and pass.
---

## What Was Wrong

`summary-panel.test.tsx`'s `header` and `summary` blocks mounted `<SummaryPanel>` live through
ink-testing-library. No command draws it that way: every one prints `summaryPanelText`, which is
`renderToString`, and that path skips effects (the subject of
`2026-10-22-the-summary-panel-is-drawn-only-by-render-to-string-so-its-scroll-hooks-never-act`). A
live mount and a print can differ for exactly that reason, so the specs pinned a frame no user sees,
and they kept `SummaryPanel` exported for nothing but themselves.

Census, 2026-10-23, run from `packages/cli`:

```
grep -rn 'renderToString(' src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

One site: `summaryPanelText` in `components/common/summary-panel.tsx`. No other component is
printed-only.

## Fix Applied

Both blocks call `summaryPanelText(props, 100)` through one `printedPanel` helper. No assertion
changed; the header's inline snapshot is byte-identical on the printed path, headless and at a
120-column terminal.

## Proposed Standard

`clean-code-standards.md` § 6, beside 6.17: a component the product only prints is specced through
the function that prints it, never through a live mount. The census above is the worklist. No
conflict with `CLAUDE.md`.
