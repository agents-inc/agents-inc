---
type: convention-drift
severity: low
affected_files:
  - apps/editor/e2e/README.md
  - apps/editor/e2e/pages/options-panel.ts
  - apps/editor/e2e/pages/dialogs.ts
  - apps/editor/e2e/pages/composer.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-26
reporting_agent: web-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`apps/editor/e2e/README.md` states the suite's assertion rule as **"Assert on the accessibility
tree"** — selection is `aria-pressed`, a badge's value is in its accessible name — and
`packages/cli/CLAUDE.md` states the set rule as **"NEVER assert a directory listing, roster or
generated union by count alone… Assert the members with `toStrictEqual` against a named
constant."**

**For a SET of controls those two rules cannot both be followed, because Playwright has no
assertion that reads accessible names in bulk.** Verified against the installed types rather than
recalled:

```
grep -n "  toHaveText(\|  toHaveAccessibleName(\|  toHaveAccessibleDescription(\|  toHaveClass(" node_modules/playwright/types/test.d.ts
```

`toHaveText` and `toHaveClass` take `string | RegExp | ReadonlyArray<string | RegExp>`;
`toHaveAccessibleName` and `toHaveAccessibleDescription` take `string | RegExp` and nothing else.
There is no `allAccessibleNames()` on `Locator` either — the only bulk reads are
`allTextContents()`, `allInnerTexts()` and `evaluateAll`, and all three read the DOM rather than
the accessibility tree.

**Where the two readings differ, the difference is invisible.** A control drawn as an
`aria-hidden` mark plus a label — an icon before a word, a glyph before a sentence — has a
`textContent` that carries the mark and an accessible name that does not. So the obvious
`toHaveText([...LABELS])` on such a row fails against a string nobody wrote, and the two ways out
are both worse than the problem: pasting the mark into the expected constant asserts a decoration
the accessibility tree says is not there, and loosening to a `RegExp` array stops asserting the
label at all.

**The workaround is already in this tree three times, and it is explained nowhere as a rule.**
Each reaches for a `data-slot` on the element holding the NAME rather than on the control:

- `apps/editor/e2e/pages/options-panel.ts` — `sectionLabels`, `[data-slot="field-label"]`,
  commented as _"the cheapest way to assert that model and thinking effort have left it"_;
- `apps/editor/e2e/pages/dialogs.ts` — `rowNames`, `[data-slot="preview-row-name"]`;
- `apps/editor/e2e/pages/dialogs.ts` — the skill-contents file list,
  `[data-slot="contents-file"]`.

Three instances of one technique, none of which says why it is not `getByRole` — so the fourth
author meets the wall from scratch. This pass was the fourth: the Phase C suggestion openers are
an `aria-hidden` `→` followed by a sentence-case label, their set has to be asserted by members
against a named constant, and there was no way to do it until a `data-slot="suggestion-label"` was
requested of the developer.

**It compounds with an already-filed defect rather than being independent of it.** All three bulk
reads are non-retrying (`2026-08-26-a-page-objects-multi-element-read-is-non-retrying-so-it-reports-a-loading-screen-as-an-empty-one`),
so the only expression of a set assertion this suite has is also the one that answers `[]` for a
row that has not mounted. A set assertion therefore needs BOTH a structural hook and a sentinel,
and neither requirement is written down beside the other.

## Fix Applied

None to existing files — discovery only, plus one instance built the documented-by-example way.
`apps/editor/e2e/pages/composer.ts` reads its opener set through
`[data-slot="suggestion-label"]`, and `apps/editor/e2e/specs/composer.spec.ts` takes an
`expect(...).toBeVisible()` sentinel on the row before the non-retrying read, with the reason
written at both sites.

Nothing was changed in `options-panel.ts` or `dialogs.ts`: all three existing instances are
correct, and the gap is that the technique has no name.

## Proposed Standard

**Add to `apps/editor/e2e/README.md`, under "Assert on the accessibility tree", one paragraph
naming the exception rather than leaving it to be rediscovered:**

> The rule has one mechanical limit. `toHaveAccessibleName` takes a single string or regular
> expression, there is no `allAccessibleNames()`, and the only bulk reads Playwright offers read
> the DOM — so a SET of controls cannot be asserted through the accessibility tree at all. Where
> the controls carry an `aria-hidden` mark their text and their accessible name differ, and
> `toHaveText` then asserts the mark as well as the label. Put a `data-slot` on the element
> holding the name, read that with `allTextContents()`, and `toStrictEqual` it against a named
> constant. `field-label`, `preview-row-name`, `contents-file` and `suggestion-label` are the four
> live instances. The read does not retry, so it needs an `expect(...).toBeVisible()` sentinel on
> the row above it.

**Cross-checked against the rules it touches, and it conflicts with none.** It is the set rule of
`packages/cli/CLAUDE.md` ("assert the members with `toStrictEqual` against a named constant") made
reachable rather than weakened; the individual-control rule is untouched, and every locator in
`composer.ts` still resolves a single control by its accessible name. It does not license
`getByTestId`: the hook is on the label a control already renders, and the control itself is still
located by role and name.

**No checker is proposed and the reason is that the defect is not lexical.** A row of controls
asserted with `toHaveText` looks identical whether the controls carry a decorative mark or not,
and whether they do is a property of the component being tested rather than of the spec. What
would close it mechanically is on the product side — a lint rule requiring `aria-hidden` on any
element whose text is a single non-word character — and that is a different finding on a different
tree.

**The counts above are a census, not a sample.** The three existing instances are the whole output
of:

```
grep -rn "allTextContents\|allInnerTexts" apps/editor/e2e
```

read line by line and with the two non-set hits (a comment in `output-preview.spec.ts` and
`marketplace.spec.ts`'s `<option>` read, whose elements carry no mark) excluded by inspection.
