# @workspace/ui — the design system

The components the editor is built from, and the tokens they are drawn with.
shadcn output, owned here rather than installed: every file in
[`src/components`](./src/components) is ours to edit, and each one ships a
`.stories.tsx` beside it.

| Command                   | What it does                                    |
| ------------------------- | ----------------------------------------------- |
| `bun run test`            | the stories, as tests, in a real Chromium       |
| `bun run storybook`       | the workshop on :6006                           |
| `bun run build-storybook` | the static build Chromatic uploads              |
| `bun run chromatic`       | publish and diff against the accepted baselines |
| `bun run lint`            | eslint                                          |
| `bun run typecheck`       | tsc                                             |

## Stories are the tests

There is no unit suite here. `vitest run` hands the story list to the vitest
addon and renders every story in a real browser, so a component with no story is
a component with no coverage — and the story is the only place its contract is
written down. `@workspace/vitest-config` is deliberately not merged in; the
reasoning is in [`vitest.config.ts`](./vitest.config.ts).

**Play functions stay simple.** One claim per story, asserted through the
accessibility tree: a role, an accessible name, an attribute, or whether the
caller's handler was reached. No helpers, no loops, nothing that reaches past the
rendered output. Two claims are two stories, and the story name is the sentence
the failure should read as.

## Axe gates every story

[`.storybook/preview.ts`](./.storybook/preview.ts) runs the a11y addon in `error`
mode, so a structural violation — an unnamed control, a bad role, a missing label
— fails `bun run test` instead of appearing in a panel nobody opens.

**`color-contrast` is held out permanently.** It is an owner ruling of
2026-08-07, not a pending fix, and `preview.ts` says so:

> The measured ratios (amber ink on the accent wash at 3.97:1, the dimmed
> incompatible cell at 2.4:1) are the design as intended; the palette is a
> deliberate taste decision for this project. The holdout keeps every
> _structural_ check — names, labels, roles — gating, which is what this suite is
> for. Do not re-enable the rule expecting a token fix; none is planned.

## Chromatic is the other half of the gate

`bun run test` asserts **structure** — a role, an accessible name, an
attribute — and structure is precisely what a picture cannot see: a button that
loses its accessible name renders identically. Chromatic asserts **appearance**,
by diffing every story against the render somebody last accepted, and nothing
else in this repository has ever compared one render to the previous one.

It needs `CHROMATIC_PROJECT_TOKEN` in the environment and nothing else;
[`chromatic.config.json`](./chromatic.config.json) points it at
`build-storybook`, runs that build itself, and records the `projectId` these
baselines belong to. CI runs it as its own `visual` job, which does not gate the
deploy.

**The baseline is one snapshot per story, per Chromatic mode**, so the size of
it is derived rather than written down — both halves move:

```sh
ls src/components/*.stories.tsx | wc -l                          # components
grep -rh '^export const ' src/components/*.stories.tsx | wc -l   # stories
```

`parameters.chromatic.modes` in [`.storybook/preview.ts`](./.storybook/preview.ts)
is the multiplier — light and dark since 2026-08-29, each carrying its own
baseline and its own approval, so turning the second one on did not disturb the
accepted light renders. A story with no dark opinion drops out of one with
`modes: { dark: { disable: true } }` in its own parameters.

**A changed render fails the run and waits for a human.** `autoAcceptChanges` is
deliberately unset, and the `//chromatic` note in
[`package.json`](./package.json) is where the reasoning lives — the usual
`"main"` setting assumes a pull request already reviewed the change, and this
repository commits straight to main, so it would accept every diff it ever found
and tell nobody. So an intentional redesign turns CI red until it is accepted in
Chromatic's UI. That is the tool working.

**A component with no story is invisible to both halves.** That was already true
of the vitest run; it is now true of the visual baseline too, which is one more
reason the file beside every component is not optional.

## One focus treatment

**Every focusable control this package ships carries `outline-none
focus-visible:ring-1 focus-visible:ring-ring`.** The alternative is the base
layer's `* { outline-ring/50 }`, which names a colour and leaves whether anything
is drawn at all to the user agent — so it is not an answer, and a design system
with no answer of its own has two.

Where the ring is written depends on one thing only:

- **In the cva base** when every render of that cva is focusable — `Button`, and
  `Input`, whose every render is an `<input>`.
- **On the element** when the cva is deliberately shared with a passive form —
  `Chip`, whose variants also dress the non-clickable stage badge on the
  add-skill rows, `MatrixGrid`, whose cell variants also dress the inert gap, and
  `Badge`, which is a `<span>` unless `render` makes it a button. A thing that
  cannot take focus should not carry a rule about being focused.

Once per component either way. `SegmentedItem` restated it on top of the `Chip`
it renders until 2026-08-08, which is the drift this rule exists to stop.

Axe cannot check any of it — a focus indicator is not machine-decidable — so a
component that adds a focusable control adds the play function that focuses it
and asserts a ring is drawn. That story is the entire gate; copy it from
`chip.stories.tsx`.

**Every focusable control in the package follows this as of 2026-08-26**, and
the last four to get it were `Badge` when `render` makes it a button, the
dialog header's ✕, `Input`, and `MenuRadioItem`.

`MenuRadioItem` is the one that shows why the date on this sentence matters more
than the sentence: it arrived on 2026-08-26 carrying `outline-none` and no ring,
which made the claim false the moment it landed, and it shipped through a review
that verified the diff against a spec — because the spec transcribes the design's
states and the design draws no focus state at all. The gate is this file, and
this file is only read by someone who thinks to look. **A new focusable part is
the moment to re-derive the sentence rather than trust it.** They were found by checking every focusable
element the package can render against source, rather than against the list the
rule's own originating report happened to name — the first two fell through to
the base layer's `* { outline-ring/50 }`, which names a colour and leaves the
drawing to the user agent.
`Input` was the one that needed a decision rather than a line: it switches the
user agent's outline off, its comment said the wrapping bar or field would own
the focus state, and no wrapper ever did. The ring is the input's own now. The
filter bar could not have carried it anyway — it holds six chips that each draw
this ring already, so a `focus-within` there would mark the whole row every time
one of them was pressed.

## Semantics live in the tree

**If it is styled as clickable it is a `<button>`, or it carries `role`,
`tabIndex` and a key handler.** `cursor-pointer` is a picture of an affordance,
not one: a pointer-only control is invisible to the keyboard, to screen readers
and to the `getByRole` queries both suites are built on, which is how this class
of defect survives review and an E2E suite that clicks everything.

**A row of mutually exclusive options is a `radiogroup` of `role="radio"` items
with a roving tabindex** — not a group of independent `aria-pressed` toggles. It
decides how many tab stops the row costs, and it is the only thing that tells
assistive technology the options are exclusive. `Segmented` is the worked
example. `MatrixGrid`, where every cell is a real `<button>` with an explicit
`aria-label` and needs no extra code to be operable, is the proof that the plain
version is the cheap one.

**`LatticeCell` paints the affordance by default and leaves the operability to
its callers.** `interactive` defaults to `true`, so a cell is `cursor-pointer`
the moment it is rendered, while `role`, `tabIndex` and key handling are the
caller's to supply — `LatticeRow` carries its own (`role="button"`,
`tabIndex={0}` and an Enter/Space handler that issues a real click), and a cell
carries none.

**The two call sites answer that differently, and the difference is this rule
meeting `nested-interactive`.** `stack-grid.tsx` passes the full set onto the
cell itself, which it is free to do: a stack cell holds nothing focusable, so
being the control costs it nothing. `skill-cell.tsx` passes none of it — its
cell holds the ••• and two badges, and a control cannot contain controls, so
`role="button"` there made every one of them presentational and unreachable.
Its operability is a SIBLING instead: `LatticeCellButton`, a real `<button>`
stretched over the cell and sitting beneath its controls, whose own comment in
[`lattice.tsx`](./src/components/lattice.tsx) carries the reasoning.

A third call site that renders a plain cell and stops at `onClick` inherits the
picture of an affordance without one, and neither the component nor the type
system will say so.

## A class in the DOM is not a class in effect

**A `h-`/`w-` utility on a `flex-1` child is dead code.** `flex-1` is `flex: 1 1 0%`, and a definite
flex-basis plus a grow factor is what decides the used main size — so `height` on a column child and
`width` on a row child are never consulted. Reach for `min-h-`/`max-h-` (or `min-w-`/`max-w-`)
instead: a min or a max clamps whatever the flex algorithm resolves, so it does take effect, and it
is usually the better design anyway — the part grows to what the shell allows and still cannot
collapse under its own content.

Nothing catches this. It type-checks, it lints, Prettier's Tailwind plugin sorts it happily, `cn`
merges it in because `h-` and `flex-1` are different groups, and every Playwright assertion passes
because none of them measures a box. `DialogPanes` was handed `h-[26rem]` to stop a dialog resizing
as the reader clicked between files; the element reported 696px while declaring 416, and the comment
above it asserted the behaviour the code was not producing. **The comment is the part that outlives
the bug** — the next reader trusts it and never measures.

**The general clause: a CSS declaration being present in the DOM is not evidence that it is in
effect.** When a layout class is load-bearing enough to justify a comment, measure it once in a real
browser (`element.clientHeight`, `getComputedStyle`) rather than asserting the class is on the
element. A comment claiming a layout behaviour is a claim, checked the same way any other claim is.

**A component that ships `flex-1` on a part callers are expected to size says so**, because the
caller's override looks like it works. The live ones are `DialogPanes`, `DialogPane`, `DialogBody`
under `scroll`, and `Input`'s inner field.

```
grep -rnE '<(DialogPanes|DialogPane|DialogBody|Chip|Input)[^>]*className="([^"]* )?(h|w)-\[' apps packages --include='*.tsx' | grep -v node_modules
```

Currently empty. It reads only the literal JSX form, so a class arriving through a variable is not
covered and the measurement is still the answer.

## House conventions

- **`data-slot` on every root**, named for the part rather than the component —
  `dialog-footer`, `lattice-row`. It is the only stable hook into a rendered
  component that no class rename can break.
- **cva variants are exported beside the component**, as `chipVariants` is, for
  the call sites that need the look without the semantics. The shared variants
  are how those stay in step; a second copy of the classes is how they drift.
- **`shadcn add` rewrites a file whole.** These components are edited in place
  and most of them no longer resemble their generated form, so re-adding one
  discards everything on this page that it carried.
