# End-to-end tests

```sh
bun run test:e2e            # headless, from apps/editor or the repo root
bun run test:e2e:ui         # Playwright's watch UI
bun run test:e2e:report     # last HTML report
bun run test:visual         # the appearance suite — see below
```

The dev server is started by Playwright (`webServer`), and an already-running
one on port 5173 is reused locally.

## Layout

| Path          | Holds                                                                            |
| ------------- | -------------------------------------------------------------------------------- |
| `fixtures.ts` | The extended `test`, which hands every spec an already-navigated `ConfigurePage` |
| `pages/`      | Page and component objects — all locators live here, never in a spec             |
| `support/`    | The stubs, and the catalogue values the specs pin to                             |
| `specs/`      | The tests                                                                        |

`ls apps/editor/e2e/support` is the list of stubs rather than a copy of it here.
**`support/stub.ts` is the one every other module in there goes through**: it
installs `@workspace/api-mocks`' handlers — the same description of the worker
the Vitest suite runs — through `@msw/playwright`, msw's own Playwright binding,
and decides nothing about what the worker says. Its own comment carries why that
split is load-bearing, and why a repeated call adds rather than replaces.

## Every spec starts signed out

`fixtures.ts` hands the network fixture `[...authHandlers, ...composeHandlers]`
as its initial handlers — `@workspace/api-mocks`' description of the worker
answering a browser that holds no cookie. **That is four routes giving four different
answers, not one blanket `null`**: the session read answers `null`, sign-in
answers a `{ url }` (starting a flow is what a signed-out browser does), sign-out
answers `{ success: true }`, and the composer's route refuses with a 401. A
blanket route over `/api/auth/**` is exactly what this replaced, and it answered
a sign-in with the session body — see `packages/api-mocks/README.md`.

It is there because EDITOR-57 made "who is signed in?" part of the baseline page
load — the nav rail asks on mount, on every route — and EDITOR-54's composer
route is signed-in only, so the submit specs need its refusal too. It is the
INITIAL set rather than the first stub, so anything a spec adds still wins and
`stubSignedIn` outranks it.

**Without it the guard fires on the whole suite at once**, which is what
happened: a component added in one corner made a request every existing spec then
refused, and every failure named the fixture rather than the component.
Signed-out is also the honest default — it is the state those specs were written
against, and the state the product is fully usable in.

Specs that want a session use `support/auth.ts`. **They build their own
`ConfigurePage` rather than taking the `configure` fixture**, and that is an
ordering constraint rather than a style: the fixture navigates during setup, so
first paint — and the session request with it — happens before any stub a test
installs.

## Accessibility is gated over the assembled page

`specs/a11y.spec.ts` runs axe over the assembled app. **Every state
`visual.spec.ts` captures has an audit there**, and that is the rule for adding
one: the same screens are worth both questions, so a capture with no audit is a
gap. It does not hold in reverse — the composer's proposal is audited and not
captured, because a live region and a pair of verbs are a question about what is
announced rather than about pixels. `packages/ui` has gated axe per component
since 2026-08-07, and **that cannot see any of what this catches** — two `main`
landmarks, a focus trap that never closes, a name unique in isolation and
duplicated six times once the grid renders. Composition is where these live.

**Two rules are held out and they are two different kinds of thing**, which is
why the spec annotates them rather than listing them. `color-contrast` is the
permanent owner ruling and never leaves. `scrollable-region-focusable` is a real
defect this suite found, filed as EDITOR-58, and held out so the suite can gate
everything else in the meantime — leaving it red gates nothing and gets ignored.

Two more were held out the same way and came out on 2026-08-29 as their defects
landed: `nested-interactive`, which was ~250 skill cells and roster rows whose
inner controls a screen reader could not reach, and `page-has-heading-one`. The
list in the spec is the live one; re-derive from it rather than from here.

## The appearance suite is a second suite

`specs/visual.spec.ts` asserts nothing. It drives the app into a chosen set of
states and hands each one to [Argos](https://argos-ci.com), which diffs it
against the render somebody last accepted. Everything else here queries the
accessibility tree, and **`getByRole` has no opinion about pixels** — a panel
that loses its padding, a dialog that overlaps the sticky bar, a band that goes
the wrong colour passes every one of the other tests. It is the app-level
counterpart to `packages/ui`'s Chromatic baselines, which cover components
standing alone; a component that is right in isolation and wrong in composition
is invisible to those and visible here.

**It has its own config and its own command.** `playwright.visual.config.ts`,
`bun run test:visual`, and CI's `visual-editor` job. A local run captures
everything and uploads nothing — `uploadToArgos` is keyed to `CI`, so
`CI=true bun run test:visual` with an `ARGOS_TOKEN` in the environment is how
you exercise the upload by hand. The reason is the server:
this suite builds the app and serves it statically, where the other one drives
`vite dev`.

**That is measured, not preferred.** Against the dev server, eleven of twelve
captures failed — the page navigating out from under the screenshot, Argos's
injected globals gone by the time they were read back. The same twelve passed
against a production build with no navigation events at all. Two explanations
were built and discarded first: Vite's dependency optimizer re-bundling the
`import()`-only deps, and the HMR client — `optimizeDeps.include` changed
nothing and neither did `hmr: false`. What is left is the plain fact that the
dev server moves the page under a one-shot operation. **An auto-retrying
`expect` never notices; `page.screenshot` has no retry to hide it with**, which
is why this was latent in the suite long before anything took a picture.

**Adding a screen is adding a `test` to that file**, deliberately, rather than
scattering captures through the behavioural specs — which would make every one
of their failures ambiguous and tie what is covered visually to whatever
happens to be tested functionally.

Captures are viewport-sized rather than full page: the grid runs thousands of
pixels down a generated catalogue, so a full-page baseline would be mostly
vendored content and every regeneration of `packages/matrix` would read as a
visual change.

The build runs as `--mode test`, which is what points the bundle at the stub
worker the fixtures route. Without it the built app calls the production API —
an origin no stub claims, and one the unstubbed-third-party refusal in
`fixtures.ts` does not watch either (it names `THIRD_PARTY_ORIGINS` and nothing
else), so the captures would be of whatever the live API returned.
`apps/editor/.env.test` holds that address and says so.

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

**A live defect is held as an expected failure, never as a skip.** When the
behaviour is known, the spec is written for the behaviour and marked
`test.fail()` with a comment saying why the fix is not in reach — Playwright
then fails the run if it ever PASSES, so the marker cannot outlive the defect.
An unconditional `.skip` runs nowhere and reads exactly like coverage; the
ruling behind that is `packages/cli/.ai-docs/agent-findings/`'s
`2026-08-21-a-skipped-spec-is-indistinguishable-from-a-passing-one.md`. The live
example is the marketplace test in `specs/saved-stack-apply.spec.ts`.

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
