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

## Two things worth knowing before adding tests

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
