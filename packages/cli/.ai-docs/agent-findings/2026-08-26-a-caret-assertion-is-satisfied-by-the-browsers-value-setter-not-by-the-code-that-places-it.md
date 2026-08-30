---
type: missing-standard
severity: medium
affected_files:
  - apps/editor/src/features/configure/components/composer.tsx
  - apps/editor/e2e/specs/composer.spec.ts
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-08-26
reporting_agent: web-developer
category: testing
domain: web
root_cause: convention-undocumented
status: open
---

## What Was Wrong

A control that writes a value into a text field and then places the caret in it has TWO
implementations that behave identically in every assertion anyone would write, and only one of them
is doing the work.

Phase C's suggestion openers set the draft from React state and then place the caret at the end of
the inserted text, so the visitor's next keystroke lands after the trailing space:

```tsx
setDraft(prefill);
field.focus();
field.setSelectionRange(prefill.length, prefill.length);
```

**That `setSelectionRange` is a no-op.** `setDraft` is a React state write, so at the moment the
call runs the textarea still holds the OLD value and the range is clamped to its length — `(0, 0)`
for an empty field. The caret nevertheless ends up at the end, because React then assigns
`node.value` on the commit and a textarea's value setter moves the caret to the end by itself.

So the observable behaviour is correct, the placement code contributes nothing, and **no assertion
about the caret can tell the two apart.**

### The reproduction, both directions

Measured against `composer.spec.ts`'s _"focuses the field and leaves the caret after the inserted
text"_, which reads `selectionStart` / `selectionEnd` / `value.length` in one `evaluate` and
asserts `start === end === length`.

| Placement call             | `flushSync` around the state write | Result                           |
| -------------------------- | ---------------------------------- | -------------------------------- |
| `(prefill.length, ...)`    | absent                             | green — caret 19/19              |
| **`(0, 0)`** — caret first | absent                             | **green — caret 19/19**          |
| `(prefill.length, ...)`    | present                            | green — caret 19/19              |
| **`(0, 0)`** — caret first | present                            | **red — caret 0/0, expected 19** |

Row 2 is the finding. A component that deliberately puts the caret at the START of the text passes
a spec whose name and whose assertion are both about the caret being at the END — and so would a
component with no placement call at all.

### Why nothing catches it

- **`tsc` and eslint have no opinion.** Both orderings are valid programs; `setSelectionRange` on a
  focused element is legal whatever the value is.
- **The failure is not a wrong caret, it is a caret that is right for the wrong reason.** There is
  no visible symptom to notice in a browser, and a screenshot cannot show a caret's provenance.
- **The spec is not weak.** It reads the three numbers in a single `evaluate` precisely so it cannot
  answer about three different moments, and its own comment says so. It is as rigorous as an
  assertion on this surface can be, and it still cannot see the difference — because the difference
  is not in the DOM after the event, it is in which agent wrote it.
- **The nearest existing rule points elsewhere.** `packages/ui/CLAUDE.md`'s _"A class in the DOM is
  not a class in effect"_ is the same shape one layer over — a declaration that is present and not
  consulted — but it is stated about CSS and is unfindable by anyone reasoning about a DOM method.

## Fix Applied

`flushSync` around the state write in `startFrom`, so `setSelectionRange` runs against the value the
field actually holds. The comment above it states the mechanism and pastes the two-direction
measurement, so the next reader does not have to re-derive why a `flushSync` is there for a
one-character effect.

**Nothing was changed in `composer.spec.ts`** — that file is the tester's lane, and the spec is not
wrong. It asserts the right property; the property is simply also true of an implementation that
does not have it.

## Proposed Standard

**One paragraph for `apps/editor/e2e/README.md`, in the section on what an assertion can and cannot
see.** Proposed wording:

> **A DOM read that must observe a React state write needs `flushSync`, and an assertion cannot
> tell you whether it has one.** Setting state and then reading or writing the DOM node in the same
> handler reads the node BEFORE the commit — so `setSelectionRange`, `scrollTo`, `select()` and
> every measurement runs against the previous value. Several of these then agree with the intended
> result by accident, because assigning `.value` moves the caret to the end and re-laying out resets
> a scroll, which makes the bug invisible to the test that was written for it. When a spec asserts a
> post-write DOM property, verify it FAILS against a deliberately wrong value of that property
> (`setSelectionRange(0, 0)`, `scrollTo(0, 0)`) rather than only against the removal of the code —
> removing it is the case the browser covers for you.

Cross-checked against `CLAUDE.md`'s NEVER/ALWAYS rules and `packages/ui/CLAUDE.md`: this weakens
nothing and duplicates nothing. It is the DOM-method sibling of _"A class in the DOM is not a class
in effect"_, and it is deliberately stated in the e2e README rather than beside that rule, because
the person who needs it is writing a component and reading the suite that failed to catch them.

**No checker is proposed, and the reason is that the defect is not lexical.** The two orderings are
the same three statements in the same order; what differs is whether a `flushSync` wraps one of
them, and a `flushSync` is legitimate to omit wherever the following statement does not read the
DOM. A rule "every `setSelectionRange` after a `setState` must be inside `flushSync`" would be a
one-site lint for the one call site that exists. What would close it mechanically is a mutation
run over the component — the manual version of which is the table above.

**Census.** Exact, and the class has one member.

```
grep -rn "setSelectionRange\|selectionStart\|scrollTo(" apps packages \
  --include='*.ts' --include='*.tsx' | grep -v node_modules
```

returned 21 hits on 2026-08-26. Read line by line: one is the product call this finding is about
(`composer.tsx`'s `setSelectionRange`), two more are its own comment, one is the page object's read
of `selectionStart`, and the remaining 17 are test-side document or element scrolls —
`configure-page.ts`'s `scrollTo` helper and its 14 call sites across `sticky-bar.spec.ts`,
`filters.spec.ts` and `composer.spec.ts`, plus `roster.spec.ts`'s `el.scrollTo(0, el.scrollHeight)`.
None of the 17 is an instance: they are driven from Playwright rather than from a React handler, so
there is no pending commit for them to run ahead of. **No product code in this tree writes the DOM
after a state write except the one site above** — this is filed because the NEXT one will look
identical and will be green.
