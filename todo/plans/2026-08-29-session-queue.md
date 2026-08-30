# Session queue — 2026-08-29

**Why this file exists.** The owner asked for it after a background workflow was stopped and the
only thing that noticed was a system notification. Requests arrived while long work was in flight,
each was picked up immediately, and nothing recorded what was already running — so an interrupted
lane was indistinguishable from a finished one. **A request accepted and not written down is a
request that can be dropped silently.** This is the in-flight register; the trackers stay canonical
for the work itself.

## In flight

| What                                        | Kind   | State                                     |
| ------------------------------------------- | ------ | ----------------------------------------- |
| full repo gates + editor E2E, after the fix | verify | running — `b6qanc0gj`, orchestrator's own |

## Landed — `wf_8de32ac6-b36`, the one-mock migration

All five lanes returned; the adversarial verifier ran every gate itself and upheld the work.

- **Editor is on the official binding.** `@msw/playwright` 0.6.7 via `defineNetworkFixture` in
  `e2e/fixtures.ts`. `grep -rn '\.route(' apps/editor/e2e` → **0**. The hand-rolled third-party
  guard is gone, replaced by the binding's own `onUnhandledRequest`.
- **CLI joined.** `stubGlobal("fetch")` in `src/` down 6 → 1; `seed-config-store.ts` stays a real
  `node:http` server but resolves the shared handlers through `workerRequestFrom` + `answerFor`.
- **Server joined**, which the first run had ruled impossible.
- **`api-mocks` grew what the others needed**: `seedPayload()`, `defaultHandlers`,
  `workerRequestFrom`, and `entry-points.test.ts` — a gate that makes `msw` unloadable and proves
  `./fixtures` still resolves, so the msw-free entry point is held rather than described.

**Coupling proved in both directions by the verifier**: changing a status in `handlers.ts` reddens a
CLI unit spec; changing a body constant in `fixtures.ts` reddens a server spec.

### The defect the migration introduced, and none of the three lanes found

`stubWith` filtered against `network.listHandlers()`, which msw seeds with the fixture's INITIAL
handlers. `fixtures.ts` seeds `authHandlers`; `stubSignedOut` passes those same instances; the
filter reduced them to an empty array and `use()` returned early. **`stubSignedOut` was a total
no-op** and all five of its call sites were passing on the fixture default rather than on the helper
they name.

Fixed by filtering against this module's own record of what it installed, since the baseline is
precisely what `use()` exists to override. Proved load-bearing: with the old filter the new
regression test fails and both controls pass; with the fix all three pass, and
`scope-reach.spec.ts`'s five — the tests the filter exists for — stay green.

**The lesson is the verifier's, and it generalises:** all three lanes proved their guarantees by
breaking something and watching a test go red, which is the right instrument and is why their claims
held. None probed the opposite direction — whether a helper that should install something can
silently install nothing. **A guard whose failure mode is silence needs a test that the guard
fired.**

## Queued

Nothing. Add here rather than starting it when something is already in flight and the new request
touches the same files.

## Landed this session, after the queue existed

- REPO-41 — `packages/ui/CLAUDE.md` un-ignored (owner ruling). Row deleted, archive line written,
  `monorepo-layout.md`'s "three negations" section corrected — it was describing three of four
  before the change and three of five after.

## Dropped by owner ruling (do not re-raise)

- Rotating the three secrets in this transcript.
- Committing and pushing.
- EDITOR-07's dark palette being generated rather than designed — known and accepted for now.
