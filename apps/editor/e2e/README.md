# End-to-end tests

```sh
bun run test:e2e            # headless, from apps/editor or the repo root
bun run test:e2e:ui         # Playwright's watch UI
bun run test:e2e:report     # last HTML report
```

The dev server is started by Playwright (`webServer`), and an already-running
one on port 5173 is reused locally.

## Layout

| Path                     | Holds                                                                            |
| ------------------------ | -------------------------------------------------------------------------------- |
| `fixtures.ts`            | The extended `test`, which hands every spec an already-navigated `ConfigurePage` |
| `pages/`                 | Page and component objects — all locators live here, never in a spec             |
| `support/catalog.ts`     | The catalogue values the specs pin to                                            |
| `support/skill-index.ts` | Route mocks for the worker's skill index, the dialog's one external call         |
| `specs/`                 | The tests                                                                        |

## Conventions

**Locate by role.** Scoping goes through landmarks the app actually exposes —
`getByRole("group", { name: "Stacks" })`, `getByRole("region", { name: "Web
skills" })` — so a class rename cannot break the suite and the locators double
as a check that the page is navigable. Building these tests is what surfaced
the missing accessible names now on the cells, badges and options panel: the
skill cell's name used to be its entire text content run together.

**Assert on the accessibility tree.** Selection is `aria-pressed`, a badge's
value is in its accessible name, a collapsed roster section is
`aria-expanded`. None of these assertions can pass while the component is
unusable with a screen reader.

**No fixed waits.** Every assertion is web-first and auto-retries. The one
place a spec reads state imperatively — scroll position — goes through
`expect.poll`.

**One behaviour per test.** A spec that fails should name the thing that
broke.

**Only the topmost modal is in the accessibility tree.** When one dialog opens
over another, the dialog library marks the one underneath `aria-hidden`, so
`getByRole` cannot see it and the failure is `element(s) not found` — which is
indistinguishable from the dialog having closed. Ask "still there behind" of a
CSS locator instead: `InstallDialog.sheet` is the live example, reached through
`[data-slot="dialog-content"]` and carrying in its comment why that one locator
does not follow the rule above. Re-assert the role-based locator AFTER the top
dialog closes, because that is the stronger claim — it proves both that the
sheet survived and that it was handed back to assistive technology. Before
concluding a stacked-dialog test found a product bug, count the DOM:

```js
document.querySelectorAll('[data-slot="dialog-content"]').length
await page.getByRole("dialog").count()
```

Two against one is hidden; one against one is closed. Playwright's
`error-context.md` ARIA snapshot is not reliable here — it rendered both
dialogs while `getByRole` matched one. And note that a dialog located by
`filter({ hasText })` claims that word: the match is a case-insensitive
substring, so once two dialogs can be open together, a word in one captures the
other's locator. `SkillContentsDialog` avoids this by locating on an accessible
name.

**A floating control needs a geometry assertion, not a visibility one.**
`toBeVisible()` is true of both elements in every overlap defect there is, and
Playwright clicks by dispatching at an element's box rather than by hit-testing
what a person would press — so neither visibility nor clickability can see one
element covering another. Assert the relationship between two live
`boundingBox()` reads, against the CONTAINER the control must clear rather than
against whichever element happens to sit in the overlap today, and prefer the
form that prints the overlap in pixels over one that prints a boolean. The
`railGap` helper in `specs/marketplace.spec.ts` is the shape.

`position: fixed` is not available inside this layout. The page grid is
`mx-auto max-w-[105.25rem]` in `src/routes/route-components.tsx`, so past that
width it stops filling the window and starts being centred in it, and every
column then slides right as the window widens while a viewport-measured offset
stays put. No constant offset is right at every width — it is the wrong
mechanism rather than a number to tune. Use `sticky` within the column the
control belongs to, and assert the geometry at a width where the grid centres
as well as at the pinned one.

**Watch the console.** A suite that ignores it is not watching the application
it drives: a warning fired on every single page load and survived a full green
run of the suite, because nothing here asserted anything about what the app
_says_ rather than what it shows. At least one spec must assert that an
ordinary path — the boring load, the successful save — reports nothing through
the app's reporting seam. `page.on("console", …)` before the navigation being
watched, collect what matches the seam's `[issue]` prefix, assert the array is
empty; `persistence.spec.ts` holds both directions of it.

**A negative is only as good as the channel that would carry it.** That is the
one rule the three above are each an instance of. `getByRole` reports the
absence of a dialog it merely cannot see; `toBeVisible` reports no overlap
because it was never able to report one; a console nobody subscribed to reports
silence for the same reason an unplugged microphone does. So before asserting
that something is absent, establish that the same locator, matcher or listener
reports it when it is PRESENT — drive the assertion red first, or pair it with a
positive that shares the channel. An assertion that has only ever been green
over a channel that has never carried a value is not evidence about the
application.

## Two things worth knowing before adding tests

**A fixture that parses can still describe an impossible configuration.** Every
share-link payload here runs through `seedPayloadSchema`, and `STORED_PAYLOAD`
passed that while pinning a project-scoped skill onto a sub-agent resting at
global — a pair the CLI's `init --from` throws on. The schema checks the shape;
nothing checked whether the thing described could be installed. It is fixed
(`packages/api-mocks/src/fixtures.ts`), and the point that outlives it is that
`seedPayloadSchema.parse` is not the whole gate on a payload fixture.

**A skill's reach is a fixed point too.** Setting a skill to project scope puts
every sub-agent carrying it into the error state, because every sub-agent rests
at global — so a spec that needs a project-scoped configuration it can actually
install needs one whose errors are resolvable in a click or two.
`SINGLE_AGENT_SKILL` in `support/catalog.ts` is the stack's one skill that
reaches a single sub-agent, and `catalog.spec.ts` guards both halves: which
skill it is, and which sub-agent it reaches. Note it is asserted through the
STACK rather than a fresh pick — a hand-picked skill takes the shared relevance
rule and reaches its whole domain; only a stack skill takes the author's word.

**`catalog.spec.ts` guards the fixtures.** The catalogue is regenerated from
the agents-inc CLI, so the skills and stacks the specs pin to will drift. That
spec asserts each one still exists, so drift shows up as one obvious failure
naming the value that moved rather than half the suite going red.

**Scroll assertions cannot be exact.** Filtering removes results, which
shortens the page, and the browser's scroll anchoring then shifts the offset to
keep the visible content stable — measured at 1200 → 588 on a narrowing filter
chip. Both are correct behaviour. The only invariant worth asserting is that
the position is not zero; anything tighter ends up encoding the anchoring
arithmetic instead of the behaviour under test. Two earlier versions of that
assertion flaked for exactly this reason.
