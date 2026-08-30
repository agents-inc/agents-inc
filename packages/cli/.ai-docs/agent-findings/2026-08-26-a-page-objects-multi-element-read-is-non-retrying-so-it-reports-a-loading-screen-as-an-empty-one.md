---
type: standard-gap
severity: medium
affected_files:
  - apps/editor/e2e/pages/dialogs.ts
  - apps/editor/e2e/specs/output-preview.spec.ts
  - apps/editor/src/features/configure/components/output-preview-dialog.tsx
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-26
reporting_agent: web-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The two reads that race a lazy `import()` are fixed — `rowNames()` and `rowPaths()` in
  `apps/editor/e2e/pages/dialogs.ts` now take a `waitForTree()` sentinel first. Two further members
  of the class are NAMED AND LEFT, both deliberately: `OutputPreviewDialog.lines()`, where an empty
  result is a legitimate expected value that a sentinel would make unassertable, and
  `SkillContentsDialog.paths()`, which has the same shape with no async chunk behind it. The
  ENFORCEMENT half is not landed — nothing mechanically distinguishes a read that has a retrying
  wait in front of it from one that does not, and this file's own prose is all that stands between
  the next page object and the same bug.
---

## What Was Wrong

`apps/editor/e2e/pages/dialogs.ts` read the output preview's tree with two Playwright APIs that
are documented as **non-retrying**:

```ts
async rowNames() {
  return this.root.locator('[data-slot="preview-row-name"]').allInnerTexts()
}

async rowPaths() {
  return this.root
    .locator('[data-slot="preview-row"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-path")))
}
```

Neither has an actionability wait in front of it. Each is one read of whatever is in the DOM at
that instant, and each returns `[]` for a selector that matches nothing rather than waiting for it
to match something.

**Every caller runs immediately after `configure.roster.previewButton.click()`**, and the model
behind the tree arrives through `import()` **by design**. `useOutputPreview` in
`output-preview-dialog.tsx` returns `{ status: "loading" }` until the chunk resolves, and `Preview`
renders its whole shell in that state — header, both panes, footer — with the tree pane present and
no `Row` inside it. So the DOM the read can legitimately see is: dialog open, tree pane mounted,
zero rows. That is indistinguishable from "the tree drew nothing", which is what the assertion then
reports.

**What makes this worth a finding rather than a flake report is the direction of the failure.**
The comparison is `expect(await preview.rowNames()).toStrictEqual(GLOBAL_ONLY_TREE)` — a
`toStrictEqual` against a named constant, which is exactly what `packages/cli/CLAUDE.md` asks for
and is the _right_ assertion. It fails loudly on `[]`, so the race surfaces as a red suite rather
than a green one. But the message it produces names a nineteen-member expected list against an
empty received one, which reads as "the preview drew nothing" — a product bug — and not as "the
read happened 40ms early". The lane that hit this diagnosed it correctly and mitigated it
product-side; the suite has since been green across two full runs. **A structural race that is
currently green is the worst state to leave one in**, because the next person to see it red will be
looking at the product.

The existing rule is close and does not reach it. `packages/cli/CLAUDE.md`:

> NEVER add a key-press method to an E2E step page object without calling `waitForWizardFooter()`
> first — React effects may not have fired yet, causing handlers to silently no-op. … The rule
> covers `BaseStep` subclasses only; non-wizard page objects need their own screen-specific
> sentinel.

That is the same mechanism and the same remedy, stated for **writes** (a key press that no-ops)
and not for **reads** (a query that under-counts). The final clause — "non-wizard page objects need
their own screen-specific sentinel" — is the sentence that would have covered this, and it is
written as a parenthetical scoping note on a rule about key presses, so nobody writing a getter
reads it.

**Census, not a sample.** `grep -rnE 'allInnerTexts\(\)|allTextContents\(\)|evaluateAll\(|\.count\(\)' e2e/`
in `apps/editor` returns eleven hits across six files. Four are in page objects and are the
population this finding is about:

| Site                                        | Racy?                 | Why                                                                                                                                                       |
| ------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dialogs.ts` `OutputPreviewDialog.rowNames` | **yes** — fixed       | Runs on `previewButton.click()`, model behind `import()`                                                                                                  |
| `dialogs.ts` `OutputPreviewDialog.rowPaths` | **yes** — fixed       | Same                                                                                                                                                      |
| `dialogs.ts` `OutputPreviewDialog.lines`    | no — and must stay so | Always follows `select(path)`, a retrying `click()`; and `[]` is a legitimate expected value — `a directory row shows an empty pane` asserts exactly that |
| `dialogs.ts` `SkillContentsDialog.paths`    | structurally, yes     | Follows `openContents()`, but the contents are already seated locally with no chunk to fetch, so there is nothing for the read to be early for            |

The remaining seven are in specs: two `.count()` pairs used as before/after comparisons or inside
`expect.poll` (which retries), one `.count()` in `roster.spec.ts`, one `allTextContents()` in
`marketplace.spec.ts`, and two lines of `e2e/README.md` prose.

`lines()` is the case that shows why a blanket rule would be wrong. Adding a sentinel there would
make the one legitimate empty state unassertable, and the test asserting it would hang to the full
timeout instead of passing. **The rule has to be about whether an empty result is a possible ANSWER,
not about which API was called.**

## Fix Applied

A private `waitForTree()` sentinel on `OutputPreviewDialog`, taken by both racy reads:

```ts
private async waitForTree() {
  await this.root.locator(ROW_SELECTOR).first().waitFor({ state: "visible" })
}
```

A locator `waitFor` rather than an `expect`, because `roster-panel.ts` states the convention this
directory follows in as many words — _"Locating is this file's job; expecting is the spec's"_ — and
no page object in `e2e/pages/` imports `expect` except `roster-panel.ts`, which uses it for a
regex text constant rather than for an assertion.

The first ROW is the sentinel rather than the tree PANE, and that choice is the whole of what makes
it work: the pane is present in all three states, so waiting for it would wait for nothing. A row
exists only in `ready`, so this separates ready from loading **and** from the refusal state.

`ROW_SELECTOR` was extracted while doing it, because `row(path)` built the same
`[data-slot="preview-row"]` literal. That removes a duplicated string rather than adding an
abstraction; it is deliberately not imported from the component, per `packages/cli/CLAUDE.md`'s rule
that an e2e assertion mirrors the product's strings rather than importing them.

**The cost of the sentinel is stated rather than hidden.** If the preview genuinely draws no rows —
the `failed` state, or a product regression that empties the tree — these two reads now hang to the
timeout instead of returning `[]` immediately. That is a worse _latency_ and a better _message_:
the timeout names the locator that never appeared, which is the fact, where the old empty-list diff
named a nineteen-member expectation and invited the reader to go looking at the model.

## Proposed Standard

**For `.ai-docs/standards/e2e/README.md`**, beside the existing stacked-dialog and floating-control
rules, and phrased as the question rather than as an API blacklist:

> **A multi-element read is not a retrying assertion.** `allInnerTexts`, `allTextContents`,
> `evaluateAll` and `count` each read the DOM once and answer `[]` or `0` for a selector matching
> nothing. Playwright's auto-waiting does not reach them: it is a property of actions and of
> `expect`, not of locators. So a page object exposing "everything currently on screen" must ask
> itself one question before it reads — **is an empty answer a possible RESULT, or only a possible
> EARLINESS?**
>
> - Only earliness → wait for a screen-specific sentinel first, chosen so it exists in the ready
>   state alone. Not the container, which is usually mounted in the loading state too.
> - A possible result → leave the read alone and make sure a retrying action precedes it, so the
>   emptiness is the screen's answer rather than the reader's timing.
>
> This is the READ half of `packages/cli/CLAUDE.md`'s `waitForWizardFooter` rule, whose closing
> clause — "non-wizard page objects need their own screen-specific sentinel" — is the same remedy
> stated for key presses.

**And a one-line amendment to that CLAUDE.md rule**, so the scoping clause stops being a
parenthetical on a rule about writes: name reads alongside key presses in the first sentence. A
getter author does not read a rule whose subject is a key press.

**A checker is proposed and it is a narrow one.** Unlike the design-pixel case next door, this does
not need a browser: a lint rule or a grep-based gate could report any `allInnerTexts` /
`allTextContents` / `evaluateAll` / `count` call in `e2e/pages/**` that is not preceded in the same
method body by an `await` on a `waitFor` or an `expect`. It would have four hits today and two of
them are correct, so it must be a REPORT with an opt-out comment rather than a refusal — the
`lines()` case is a legitimate exemption and needs to say so at the site. This is not landed; it is
a proposal, and the honest reason it is not landed is that it belongs to another lane's file
(`eslint.config.js`) and a remediation pass is not where a new gate belongs. Until it exists,
**nothing mechanically catches the next one** — that is the state, said out loud rather than left
to be inferred from this file existing.

**The table above is a census** of the four page-object sites, from the grep quoted in the
paragraph that reports it, not a sample.
