# @workspace/ui: the design system

These are the components the editor is built from and the tokens they are drawn with. They started
as shadcn output and are owned here: every file in `src/components` is ours to edit and ships a
`.stories.tsx` beside it. `shadcn add` rewrites a file whole and discards local edits, so do not
re-add a component.

| Command                      | What it does                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `bun run test`               | checks that every colour token has a dark value, then runs every story as a test in real Chromium |
| `bun run storybook`          | the workshop on :6006                                                                             |
| `bun run chromatic`          | builds Storybook, then diffs against the accepted baselines                                       |
| `bun run tokens`             | rebuilds `src/styles/tokens.css` from `tokens/tokens.json`                                        |
| `bun run lint` / `typecheck` | eslint / tsc                                                                                      |

## Gates

- **Stories are the tests.** A component with no story has no coverage. Use one claim per story,
  asserted through the accessibility tree (a role, a name, an attribute, or a handler being
  reached), with no helpers or loops. Two claims make two stories.
- **Axe gates every story** (`.storybook/preview.ts`, `a11y.test: "error"`). `color-contrast` is
  held out permanently by owner ruling. Do not re-enable it expecting a token fix.
- **Chromatic diffs every story in light and dark** (`parameters.chromatic.modes`). A story with no
  dark opinion opts out with `modes: { dark: { disable: true } }`. `autoAcceptChanges` is unset on
  purpose, so a changed render fails CI's `visual-ui` job until someone accepts it in Chromatic. The
  `//chromatic` note in `package.json` says why.
- **A new colour token carries its dark value** (`scripts/check-token-parity.ts`).

## Rules

- **One focus treatment:** `outline-none focus-visible:ring-1 focus-visible:ring-ring`, once per
  component. Put it in the cva base when every render is focusable (`Button`, `Input`), and on the
  element when the cva also dresses a passive form (`Chip`, `MatrixGrid`, `Badge`). Focus outlines
  are not tested, by owner ruling: no story asserts the ring.
- **If it looks clickable it is a `<button>`**, or it carries `role`, `tabIndex` and a key handler.
  Exclusive options are a `radiogroup` of `role="radio"` items with a roving tabindex (`Segmented`),
  not a group of `aria-pressed` toggles.
- **An attribute a part sets but a caller may override is merged with `??`**
  (`tabIndex={tabIndex ?? rovingTabIndex}`), never written before `{...props}`: a caller's
  `undefined` is a key in the spread and replaces it. The exception is an attribute a caller must be
  able to remove: `Chip` writes `aria-pressed` before its spread, so `SegmentedItem`'s
  `aria-pressed={undefined}` drops it from a radio.
- **`LatticeCell` paints the affordance and leaves operability to its callers.** A cell that holds
  no controls takes `role`, `tabIndex` and a key handler itself (`stack-grid.tsx`). A cell that
  holds controls uses a sibling `LatticeCellButton` instead (`skill-cell.tsx`), because a control
  cannot contain controls.
- **`h-`/`w-` on a `flex-1` child does nothing.** Use `min-`/`max-` sizes. `DialogPanes`,
  `DialogPane` (`left`, `content`), `DialogBody` under `scroll`, and `Input`'s inner field all ship
  `flex-1`. A class in the DOM is not proof it takes effect: measure it in a browser
  (`clientHeight`, `getComputedStyle`).
- **Put `data-slot` on every root**, named for the part (`dialog-footer`, `lattice-row`). It is the
  only hook a class rename cannot break.
- **Export cva variants beside the component** (`chipVariants`) for call sites that need the look
  without the semantics. Do not copy the classes.
