# @workspace/api-mocks

One mock of the worker's HTTP surface, so the editor's tests agree with each other about what that
worker answers.

The worker is [`apps/server`](../../apps/server); the client that calls its config routes is
[`apps/editor/src/lib/api/configs.ts`](../../apps/editor/src/lib/api/configs.ts).

## Entry points

| Import                          | Holds                                       | Who reads it                                |
| ------------------------------- | ------------------------------------------- | ------------------------------------------- |
| `@workspace/api-mocks`          | fixtures and the MSW handlers               | the editor's Vitest suite                   |
| `@workspace/api-mocks/fixtures` | the payloads and bodies only, no msw import | `apps/editor/e2e/support/sharing.ts`        |
| `@workspace/api-mocks/node`     | `configMockServer`, an `msw/node` server    | `apps/editor/vitest.setup.ts`, and per-test |

`configMockServer` keeps its name from when configs were the only routes there were. It serves the
whole worker, skill index included.

`./fixtures` is separate so Playwright — which keeps its own `page.route` interception, because that
is what runs in a real browser — can take the payloads without loading an interceptor it will never
use. What the two suites share is the truth about the response, not the mechanism that delivers it.

## What is mocked

Exactly the routes the editor calls, at the statuses something asserts:

| Route              | Answer                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `POST /configs`    | `201` with `{ id }`; `503` via `storeRefusedHandler`                                                    |
| `GET /configs/:id` | `200` for `STORED_ID`, `500` for `UNREADABLE_CONFIG_ID`, `404` otherwise                                |
| `GET /skills`      | `200` + `x-skill-index: fresh`; `stale` via `staleSkillIndexHandler`; `503` via its unavailable handler |

`POST /monitoring` is absent: Sentry's SDK tunnels through it and no editor code calls it. `GET
/configs/:id`'s `503` is absent for the same reason nothing else invented here is present — the
client cannot tell it from the `500`, so a test for it would assert the same branch twice.

The skill index has three answers rather than two because its degraded path is not an error. The
index is built by a daily GitHub Action and published to KV
([`.github/workflows/build-skill-index.yml`](../../.github/workflows/build-skill-index.yml)); the
worker only reads it. When that build stops landing the worker keeps serving what it has, with the
freshness header flipped to `stale` — so a client that reads the header can say the list is ageing,
and one that ignores it still gets usable results. The `503` is the narrow remaining case: no index
has ever been published. It is reachable exactly once in the worker's life, because the published
value carries no expiry.

## Why the payload is parsed and not asserted

`STORED_PAYLOAD` runs through `seedPayloadSchema` from `@workspace/matrix/seed`, and `SKILL_INDEX`
through `skillIndexSchema` from `@workspace/matrix/skill-index` — schemas both
the worker and the editor already validate against. The worker validates before it stores and before
it serves, so parsing here is the step the real response has already been through. A fixture
that drifts from the contract fails at import, in every consumer, instead of in whichever assertion
happens to read the field that moved.

The schema is not the whole of what a fixture can get wrong, though. `STORED_PAYLOAD` parsed
perfectly while pinning a **project**-scoped skill onto a sub-agent resting at global — a pair
`init --from` throws on rather than installs (`seedToWizardResult` → `unwritableAssignmentsError`),
so the canonical "a configuration the worker holds" fixture described a link nobody could use. Its
`web-developer` entry now carries `scope: "project"`, and that key is load-bearing rather than
flavour. A fixture is a claim about a real response, and the contract only checks the shape of one.

This is also why the package does not import `apps/server`. Its `AppType` is consumable, but only
as the emitted declaration — the worker's source names `Env` from `wrangler types`, and pulling that
in redefines DOM globals such as `Element` and `Response` in whatever consumes it. The shared schema
gives the same guarantee about the part that can actually drift, with none of that.
