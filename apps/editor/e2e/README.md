# End-to-end tests

```sh
bun run test:e2e            # headless, from apps/editor or the repo root
bun run test:e2e:ui         # Playwright's watch UI
bun run test:e2e:report     # last HTML report
bun run test:visual         # the appearance suite (Argos)
```

Playwright starts its own dev server on port 5199 (`EDITOR_E2E_PORT` moves it). It never reuses a
server that is already running, because that would test a different tree. It serves with HMR off
(`vite.e2e.config.ts`), because a source file saved mid-run would otherwise reach the page a spec is
driving and reset its stores.

| Path          | Holds                                                                            |
| ------------- | -------------------------------------------------------------------------------- |
| `fixtures.ts` | the extended `test`, which gives every spec an already-navigated `ConfigurePage` |
| `pages/`      | page and component objects; all locators live here, never in a spec              |
| `support/`    | the stubs and the catalogue values the specs pin to                              |
| `specs/`      | the tests                                                                        |

`support/stub.ts` installs `@workspace/api-mocks`' handlers through `@msw/playwright`, and every
other stub goes through it. A request to an unstubbed third-party origin (`THIRD_PARTY_ORIGINS`)
fails the spec.

## Before adding a spec

- **Every spec starts signed out.** `fixtures.ts` installs `authHandlers` and `composeHandlers` as
  the initial set. For a session, use `support/auth.ts` and build your own `ConfigurePage`, because
  the `configure` fixture navigates before any stub you add.
- **Seed `localStorage` at a bare origin page, not after a boot, and count page loads.** Under load
  each load costs several seconds of the 30 s budget, so a test that needs four is near the limit.
  `atTheOrigin` in `specs/accounts.spec.ts` stubs an empty page on the origin for this.
- **Accessibility:** `specs/a11y.spec.ts` runs axe over the assembled page. Every state
  `visual.spec.ts` captures needs an audit there. The held-out rules are listed in that spec.
  `color-contrast` is a permanent ruling.
- **Appearance:** `specs/visual.spec.ts` hands states to Argos. It builds with
  `--mode test` and serves the result statically through `playwright.visual.config.ts`; captures
  failed against the dev server. To add a screen, add a `test` to that file. Captures are
  viewport-sized. A local run uploads nothing; `CI=true` with `ARGOS_TOKEN` does.
- **The viewport is 1600×1000**, above the 1500px threshold in `src/lib/viewport.ts`.
- **`catalog.spec.ts` guards the fixtures.** The catalogue is regenerated from the CLI, so it
  asserts that every skill and stack the specs pin to still exists. `SINGLE_AGENT_SKILL` in
  `support/catalog.ts` is the stack skill that reaches one sub-agent. Use it when a spec needs an
  installable project-scoped configuration.
- **A payload fixture must be installable, not only parse.** `seedPayloadSchema` checks shape only.
- **A choice the preview copies from the CLI needs a crossing row that sets both sources, to
  different values.** Where `output-preview.ts` picks `a ?? b` and the CLI picks the same in its own
  code, `preview-matches-install.spec.ts` sees the order flipped only in a row where both are set
  and differ; a row setting one passes either way round. Where one source is catalogue data, hold
  the difference in a type, as `LINK_MODEL` does, so a regenerated catalogue cannot make the row
  inert.

## Conventions

- **Locate by role** through the landmarks the app exposes, and **assert on the accessibility tree**
  (`aria-pressed`, `aria-expanded`, accessible names). Where a role is right but not unique, locate
  by `data-slot` (`ConfigurePage.adoptionNotice`).
- **No fixed waits.** Use web-first assertions. Imperative reads such as scroll position go through
  `expect.poll`. Assert only that a scroll position is not zero, because the browser's scroll
  anchoring moves it.
- **One behaviour per test.**
- **Hold a live defect with `test.fail()` and a comment, never with `.skip`.** A skip runs nowhere
  and reads as coverage.
- **Only the topmost modal is in the accessibility tree.** To check that a dialog is still open
  behind another, use a CSS locator (`InstallDialog.sheet`), then re-assert by role after the top
  dialog closes. `filter({ hasText })` matches substrings, so it can claim the wrong dialog.
- **A toast is a dialog to a role selector.** Base UI gives each toast `role="dialog"` (or
  `alertdialog`) and `aria-modal="false"`, so a count of open dialogs leaves out
  `[aria-modal="false"]`.
- **Check overlap with geometry:** compare two `boundingBox()` reads against the container. Neither
  `toBeVisible()` nor a click can see an overlap. `position: fixed` is wrong in this layout because
  the page centres past its max width (`src/routes/route-components.tsx`). Use `sticky`.
- **Watch the console.** An ordinary path must report nothing through the app's `[issue]` seam
  (`persistence.spec.ts`).
- **Prove a negative's channel.** Before asserting that something is absent, show that the same
  locator, matcher or listener reports it when it is present.
