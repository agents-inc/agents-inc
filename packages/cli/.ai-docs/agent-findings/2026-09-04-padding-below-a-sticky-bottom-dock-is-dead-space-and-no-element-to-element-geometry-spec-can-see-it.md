---
type: anti-pattern
severity: low
affected_files:
  - apps/editor/src/features/configure/components/configure-screen.tsx
  - apps/editor/e2e/specs/composer.spec.ts
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-09-04
reporting_agent: web-developer
category: testing
domain: web
root_cause: missing-rule
status: resolved
resolved_by: >-
  EDITOR-75 removed `pb-30` from `<main>` in `configure-screen.tsx` and recorded the
  mechanism in the comment above the sticky wrapper, so the next reader learns why the
  column reserves nothing under the dock. No spec changed — see "Fix Applied" for why
  none could have, which is the half worth keeping.
---

## What Was Wrong

`<main>` on the Editor's configure screen carried `pb-30` — 7.5rem, which renders as 132px
because `packages/ui/src/styles/globals.css` sets the root to `font-size: 110%`. Its last
child in flow is the composer's sticky wrapper, `<div className="pointer-events-none sticky
bottom-0 z-60">`.

**Padding under a `sticky bottom-0` last child is unreachable by construction.** A sticky box
is constrained to its containing block, which for an ordinary in-flow child is the parent's
CONTENT box — the padding lies entirely outside it. The dock's flow position is already at the
foot of that content box, so `bottom: 0` can never pull it any lower and the padding is a strip
the dock cannot enter. Measured at maximum scroll, 1600×1000:

|                               | with `pb-30` | without |
| ----------------------------- | -----------: | ------: |
| `main.bottom - dock.bottom`   |        132px |     0px |
| dock bottom, viewport at 1000 |        868px |  1000px |

So the dock parked 132px above the viewport floor with a strip of bare `bg-column` beneath it,
and 132px of the grid that could have been on screen was not. The same constant also made a
page with no results scroll for nothing: with nothing matching the filter,
`document.documentElement.scrollHeight` was 1129 against an `innerHeight` of 1000, and 1000
after the removal — a 129px scroll on a page with no content below the fold.

**It was not holding anything open.** The clearance the last skill cell needs comes from the
dock's own `mt-[1.625rem]` in `composer.tsx`, and it barely moved: the gap from the last cell's
bottom to the band's top read 29px before and 28px after at 1364 wide, 28px either way at 1600,
and 188px either way with a proposal open. At the layout's real floor — `min-w-[85.25rem]`
computes to 1500.4px at the 110% root, so 1501 is the narrowest viewport that does not scroll
sideways — the post-change reads are `main.bottom - dock.bottom = 0`, `dock.bottom = 1000`
against a 1000px viewport, and 28px of clearance. `elementFromPoint` at the last cell's centre
returned that cell's own button at every width and in both states — it was never covered and
never unclickable.

**And nothing on the surface could have seen it.** `composer.spec.ts`'s
`the composer's geometry` block holds thirteen tests — a census, from
`awk '/^test.describe\("the composer.s geometry"/,0' e2e/specs/composer.spec.ts | grep -c '^  test('`
— including one written for exactly this hazard:

```
// A dock pinned to the viewport's foot hides whatever is under it, so the
// page has to end above it: at maximum scroll the last cell in the grid must
// still be reachable.
test("does not permanently cover the end of the grid", …
  expect(band.y - (cell.y + cell.height)).toBeGreaterThanOrEqual(0)
```

Every one of them is a relationship between two ELEMENTS. The dead space is not between two
elements; it is between the last element and its container's own trailing edge. The whole suite
reads `<main>`'s box exactly once — `grep -rn 'locator("main")' e2e --include='*.ts'` returns
two lines, one of them a locator for the import notice — and that single read compares
`band.width` to `main.width`. Nothing anywhere reads its bottom or its height.
`git log -S"pb-30" -- src` returns only the monorepo-absorb commit, so nothing
records what the constant was for either — 132px of reservation that no gate, no comment and
no history could account for.

That spec is a live gate, established rather than assumed: replacing the dock's
`mt-[1.625rem]` with `-mt-20` reddens it at `Received: -87.984375` against `Expected: >= 0`.
It stayed green through the introduction of this padding and through its removal because
neither moved anything it measures.

## Fix Applied

`pb-30` deleted from `<main>`; the class list is now `min-w-0 bg-column px-gutter pt-0`. The
comment above the sticky wrapper — which already carries why the dock is `sticky` rather than
`fixed` and why its height is never measured — gained the containing-block rule, so a future
`pb-*` has something to be refused by.

Census of the constant before the change, one hit in one file:

```
grep -rn "pb-30\|pb-\[7.5rem\]" apps/editor/src apps/editor/e2e apps/www/src packages/ui/src
```

**No spec was touched, and that is the finding rather than an omission.** The full suite is 507
passed / 0 failed at exit 0 both before and after. A spec that would have caught this does not
exist, and writing one was outside the row's scope — `## Proposed Standard` is where it belongs.

## Proposed Standard

`apps/editor/e2e/README.md`, appended to the existing **"A floating control needs a geometry
assertion, not a visibility one"** paragraph — which already says to assert "against the
CONTAINER the control must clear", and stops one step short of the case here:

> **Where the control is the container's last child, assert its trailing edge too.** A
> `sticky bottom-0` box is confined to its containing block's content box, so any
> `padding-bottom` on that container is a strip the box can never reach: at maximum scroll it
> parks that far above the viewport floor with bare background beneath it, and a page shorter
> than the viewport scrolls by exactly that much for nothing. Every element-to-element gap
> stays green through it, because the dead space is between the last element and the container
> itself. One assertion covers it — `main.bottom === dock.bottom` at maximum scroll — and it is
> the only one in the file that can fail for this reason.

Cross-checked against CLAUDE.md's NEVER/ALWAYS rules and against `e2e/README.md`'s own
"A negative is only as good as the channel that would carry it": this conflicts with neither,
and is an instance of the second — the channel that would have carried this defect was never
subscribed to.

Two observations that are NOT part of the proposal, recorded because they were found on the way:

- The five `"leaves the marketplace button clear …"` specs in `composer.spec.ts` measure
  `dock.y - (button.y + button.height)` against `>= 0`. The marketplace button moved into the
  nav rail on 2026-09-04, so at maximum scroll that reads 676.56px between two elements in
  different columns which can no longer collide. They are vacuous rather than wrong, and the
  work that made them so is in flight in another lane — reported here rather than changed.
- Both Playwright configs say the editor is "desktop-only below 1324px" and pin their viewport
  above that figure. The floor is 1500.4px: `route-components.tsx` declares
  `min-w-[85.25rem]` and `globals.css` sets the root to 110%, and
  `getComputedStyle(grid).minWidth` reads `1500.4px`. At a 1364px viewport the page already
  scrolls 136px sideways. Both suites run at 1600, so nothing is testing below the floor today
  — the figure in the comment is what is wrong, and it is restated in
  `playwright.visual.config.ts` as the reason its own viewport is what it is.
