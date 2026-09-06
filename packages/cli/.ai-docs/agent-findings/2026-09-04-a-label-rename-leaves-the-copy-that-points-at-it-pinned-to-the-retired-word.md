---
type: standard-gap
severity: medium
affected_files:
  - apps/editor/src/features/configure/lib/use-catalog-first.ts
  - apps/editor/e2e/specs/shared-link.spec.ts
  - apps/editor/src/components/nav-rail.tsx
  - apps/editor/src/routes/search.ts
  - apps/editor/e2e/specs/accounts.spec.ts
standards_docs:
  - apps/editor/e2e/README.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-09-04
reporting_agent: web-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The instance is repaired — the editor's nav rail, the wayfinding copy that
  points at it and the assertion pinning the two now all say Editor. The general
  shape is not enforced anywhere: nothing reports a second piece of copy naming a
  nav label, and nothing makes a label rename redden the copy that points at it.
---

## What Was Wrong

The editor's nav rail had `Home` renamed to `About` and `Configure` renamed to
`Editor`, and the change landed with the full suite green. It left the app
contradicting itself: `SHARED_NOTICE` in `use-catalog-first.ts` — the line a
visitor reads when a shared link is open — still told them their own
configuration was "untouched under Configure", naming a word the rail no longer
had. Three comments describing the same link (in `nav-rail.tsx`, in
`configureSearchSchema`'s docblock in `routes/search.ts`, and above the
`sayCatalogue(null)` call that clears the notice) named it too.

**The suite did have a pin on that copy, and the pin could not fire.** The spec
`"says whose configuration is on screen, and where one's own is"` in
`shared-link.spec.ts` asserted `toContainText("Configure")` against the notice,
precisely so the copy could not drift away from the label. But the assertion
holds the LABEL'S literal and checks the COPY, so it is red in one direction
only:

- copy changes, label does not → red. The pin works.
- **label changes, copy does not → green.** The copy still contains the old word,
  so the substring is still found, and the assertion goes on asserting that the
  wayfinding is correct at exactly the moment it stopped being.

What makes this worse than an ordinary uncovered case is the sibling assertion.
Two specs in the same file located the rail's link by
`getByRole("link", { name: "Configure" })`, and those DID go red on the rename.
So the rename author saw a red file, repointed the locators and the test name in
it, and stopped — the file was green again and the copy assertion had never
complained. **A partial red is more misleading than no red at all**: it says the
file has been considered.

Census over `apps/editor` (not a sample) — one piece of product copy names a nav
label, and one assertion pins it:

```
grep -rnE '"[^"]*\b(under|from) (Editor|About|Docs)\b' src --include='*.ts' --include='*.tsx'
grep -rnE 'toContainText\("(Editor|About|Docs)"\)|toHaveText\("(Editor|About|Docs)"\)' e2e
grep -rnE 'getByRole\("link", \{ name: "(Editor|About|Docs)"' e2e
```

## Fix Applied

The copy, the three comments and the assertion were moved to `Editor`. The red
was established first by changing the copy alone and running the spec, which
failed naming the assertion — confirming the pin is real in the direction it
covers, and establishing that the green before the change was the one-directional
hole and not an absent test.

Nothing was renamed on the code side: the route, `ConfigureScreen`,
`configureSearchSchema`, `CONFIGURE_SEARCH_DEFAULTS`, `features/configure/` and
`e2e/pages/configure-page.ts` are the screen's identity rather than the nav word,
and comments naming "the Configure screen" were left because they name that
identity. Only text a person reads on screen, and the comments describing the nav
LINK, moved.

## Proposed Standard

For `apps/editor/e2e/README.md` → "Conventions", and matching the reasoning
already in `packages/cli/CLAUDE.md` about assertions bound to a constant the
product renders:

**Where product copy names a navigation label, one assertion must read both ends
in the same act.** A substring check on the copy holding the label's literal
pins only half of the pair. The assertion that cannot go one-directionally green
locates the nav link, reads its text, and asserts the copy contains what it
read — so renaming the label reddens the copy assertion directly rather than
only its neighbours:

```ts
const label = await page.getByRole("navigation").getByRole("link").filter(...).innerText()
await expect(configure.importNotice).toContainText(label)
```

This does NOT contradict the existing rule that a rendering assertion keeps its
literal rather than importing the constant the product renders. That rule is
about importing from the PRODUCT, and it holds here: the label is read from the
rendered page, not from `nav-rail.tsx`. What is being removed is a second
hand-written copy of the same word in the test, which is the thing that stayed
true while the app stopped being.

The narrower half, if the above is judged too clever for one line of copy:
**a rename of user-visible text greps for the retired word across `src` and `e2e`
in every file type, not only in the files the type-checker or a red test names.**
The retired word survived in three comments and one string here, and every one of
those files was open during the rename — the comments sit in the same file as the
link that was renamed, and in the docblock of the schema that link supplies.
