---
type: anti-pattern
severity: medium
affected_files:
  - packages/ui/src/components/matrix-grid.tsx
  - packages/ui/src/components/matrix-grid.stories.tsx
  - apps/editor/e2e/pages/options-panel.ts
  - apps/editor/e2e/specs/skill-options.spec.ts
  - apps/editor/e2e/specs/skill-memory.spec.ts
  - apps/editor/e2e/specs/scope-reach.spec.ts
standards_docs:
  - packages/ui/CLAUDE.md
  - apps/editor/e2e/README.md
date: 2026-08-26
reporting_agent: pm
category: testing
domain: web
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`MatrixGrid`'s cell is a `<button>` whose visible content **is** its state — the component's own
docblock says so in as many words: _"Clicking a cell cycles it empty → lazy → preloaded → empty, and
the word in the cell *is* the state — the design has no legend and no icons."_ The button then
carries a hardcoded `aria-label`:

```
packages/ui/src/components/matrix-grid.tsx:83
aria-label={`${row.label} ${cell.label}`}
```

**`aria-label` wins over content in the accessible-name computation**, so the button's name is
`web dev` and the word inside it — `lazy`, `pre`, or nothing — reaches the accessibility tree
through no channel at all. A screen-reader user in the skill options panel can find every cell and
operate every cell, and cannot learn the state of a single one. Cycling it announces nothing new,
because the name does not change.

Two smaller consequences ride along:

- **The three states are distinguished by border, fill and text colour, plus the word.** With the
  word unreachable, the remaining channel is colour alone — which is what the visible-text override
  turns a legitimate design into.
- **The visible text is not contained in the accessible name**, which is the shape WCAG 2.5.3
  (Label in Name, Level A) exists to catch for a control with a text label.

**Nothing in the repository can notice.** That is the part worth keeping:

- **Axe cannot.** `packages/ui/.storybook/preview.ts` runs the a11y addon in `error` mode and it
  gates `bun run test`, but the button **has** a name — there is no rule for "the name discards the
  content". The story `ClickingACellCycles` queries `getByRole("button", { name: "web pm" })` and
  passes, because the lossy name is what it was written against.
- **The E2E suite cannot**, and it is set up to look like it does. `apps/editor/e2e/README.md`
  states the rule as _"Assert on the accessibility tree"_, and the cell locator honours it —
  `options-panel.ts`'s `matrixCell(domain, role)` is `getByRole("button", { name: `${domain}
  ${role}` })`. But every assertion about the **state** then reads the DOM instead:

  ```
  await expect(cell).toHaveText("pre")   // skill-options.spec.ts:355
  ```

  `toHaveText` reads `textContent`, which is the one thing a screen reader never receives here. So
  the suite locates through the tree and verifies through the DOM, and the gap between them is
  exactly the defect. Four specs assert this way:

  ```
  grep -rn 'matrixCell\|cycleAssignment' apps/editor/e2e --include='*.ts' | grep -v pages/options-panel.ts
  ```

- **`LabelledAgentCell` in `skill-options-panel.tsx` is the correct sibling** and shows the defect is
  local rather than a house habit: it renders the same `matrixCellVariants` chrome with the agent id
  and the load word as **content** and carries no `aria-label`, so its name is
  `web-researcher lazy` — the coordinate and the state, both announced.

## Fix Applied

**None — discovery only, and deliberately so.**

Found while specifying the composer proposal's diffed matrix
(`todo/plans/editor-v6/phase-c-spec.md` §11), which reuses this component in a read-only mode and
therefore had to decide what a cell announces. The read-only mode is specified to carry the full
sentence (`Web developer, added, preloaded`), so **the new surface will announce more than the
shipped one**.

Not fixed in that work, for one reason: changing this `aria-label` changes a **shipped accessible
name that two suites query by**. `matrix-grid.stories.tsx` has two play functions matching
`{ name: "web dev" }` / `{ name: "web pm" }`, and `options-panel.ts`'s locator is built from the
same string and reached by four E2E specs. It is a real change with real test edits, and folding it
into a feature spec would have hidden it inside a diff about something else.

## Proposed Standard

**Cross-checked against `packages/ui/CLAUDE.md` before writing; it conflicts with nothing there and
extends one section it already owns.**

1. **`packages/ui/CLAUDE.md` → "Semantics live in the tree" gains a paragraph.** That section
   already rules that a styled affordance must be a real control and that a row of exclusive options
   must be a `radiogroup`. What it does not say is what a control's **name** owes its content:

   > **An `aria-label` replaces the content; it never adds to it.** Where a control's visible text
   > carries meaning — a state word, a count, a value — the label must contain it or the meaning is
   > gone. Prefer no `aria-label` at all and let the content name the control; where a coordinate has
   > to be added, add it to the content in an `sr-only` span rather than overriding the content with
   > a label. Axe cannot see this: the control has a name, and there is no rule for a name that
   > discards what it names.

2. **`apps/editor/e2e/README.md` gains the corollary**, because this is where the gap was survivable:

   > A locator that resolves through the accessibility tree and an assertion that reads
   > `textContent` are two different claims. Where a control's own text is its state, assert the
   > state with `toHaveAccessibleName`, not `toHaveText` — otherwise the suite proves the DOM says
   > it and says nothing about what anybody hears.

3. **A one-line census** for the first rule, and it is cheap because the class is narrow — a template
   `aria-label` on a control that also renders meaningful text:

   ```
   grep -rn 'aria-label={`' packages/ui/src/components/*.tsx
   grep -rn 'aria-label={`' apps/editor/src --include='*.tsx'
   ```

   **Both were run to exhaustion on 2026-08-26 and this is a census, not a sample.**
   `packages/ui/src/components` returns exactly one hit — this one. `apps/editor/src` returns
   eighteen, and **every one of them is correct**, which is what makes this an outlier rather than a
   habit. The editor's own convention is visible in the shape of them: `Install mode: ${install}`,
   `Scope: ${scope}`, `Load mode: ${skill.load}`, `Model for ${agentId}: ${model}`,
   `Effort for ${agentId}: ${effort}` — **the label names the control and then states the value the
   control displays**, which is the rule above already being followed by the same team, one package
   over, on controls of exactly this kind. `roster-panel.tsx`'s cycling words are the closest
   siblings the matrix cell has, and they are the worked example to copy.
