---
type: convention-drift
severity: medium
affected_files:
  - apps/editor/e2e/specs/roster.spec.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-26
reporting_agent: web-developer
category: testing
domain: e2e
root_cause: premise-expired
status: open
---

## What Was Wrong

`roster.spec.ts` reaches the roster's sticky domain bands as

```
const bands = page.locator("aside .rail-scrollbar button[aria-expanded]")
```

and then asserts that band N pins at `N × step`, where `step` is
`bands.first().boundingBox().height`.

That locator was exact when it was written: the bands were the only expandable
control in the panel. Phase A of editor-v6 put a grouping menu in the panel
header, inside the same scroller, and Base UI writes `aria-expanded` on a menu
trigger **unconditionally** — `MenuRoot.js` sets `mergedProps['aria-expanded'] =
false` on the inactive trigger, so the attribute is present when the menu is
shut. The trigger precedes the bands in the DOM, so:

```
aside .rail-scrollbar button[aria-expanded]   -> 6 matches, first is "domain ▾"
aside .rail-scrollbar section button[aria-expanded] -> 5 matches, first is "web 0 of 3"
```

`bands.first()` became the 14px-tall menu trigger, `step` became 14 instead of
26, and the test failed with `expected 66, received -2769` — a number that
names neither the cause nor the control that caused it.

The failure mode worth recording is not that the test broke. It is **how it
broke**: an attribute-only locator standing in for "the set of X" does not
report that it has stopped meaning X. It keeps resolving, keeps counting, and
starts measuring a different element. Had the new control been 26px tall the
suite would have stayed green while asserting nothing about band 5.

This is the only such locator in the editor's suite —
`grep -rn 'aria-expanded\]\|aria-pressed\]\|aria-checked\]\|\[role=' apps/editor/e2e/specs apps/editor/e2e/pages`
returns one line, the one above. A census, not a sample.

## Fix Applied

None — discovery only, and deliberately so. This lane owns non-test source and
may not edit a spec. Reported to the orchestrator with the one-word repair:
insert `section` (`aside .rail-scrollbar section button[aria-expanded]`). Each
band is the first child of a `<section class="contents">`; the header hinge is
not inside one, so the narrowed selector is exactly the five bands and nothing
else. Verified live, output quoted above.

Suppressing the trigger's `aria-expanded` was considered and rejected: it is
the attribute that tells a screen reader the control opens something, and Base
UI supplies it precisely so an app cannot forget.

## Proposed Standard

Into `.ai-docs/standards/e2e/anti-patterns.md`, beside the existing locator
rules:

> **A locator standing in for a SET is keyed on something only that set has.**
> A bare ARIA attribute (`button[aria-expanded]`, `[aria-pressed]`,
> `[role=group]`) describes a behaviour, not a population, so it silently
> admits the next control that behaves that way — and a set locator that has
> grown a member does not fail, it measures the wrong element. Anchor it to the
> structure that makes the set a set (the `<section>` each band opens, a
> `data-slot`, an accessible-name pattern), or assert the members with
> `toStrictEqual` so a new arrival reddens the line that owns it.

This is the set-membership half of CLAUDE.md's existing rule "NEVER assert a
directory listing, roster or generated union by count alone" — same cause (a
count cannot see a swap), arriving from the locator end rather than the
assertion end. It does not conflict with any NEVER/ALWAYS rule I can find; it
extends one.
