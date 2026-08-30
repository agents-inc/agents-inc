# @workspace/api-mocks

One mock of every HTTP surface the editor talks to — the worker, and the two GitHub hosts an
external skill's directory is read from — so the editor's two suites agree with each other about
what each of them answers.

The worker is [`apps/server`](../../apps/server); the clients that call it are the modules under
[`apps/editor/src/lib/api/`](../../apps/editor/src/lib/api/). Re-derive what the worker actually
serves rather than trusting a list here — `grep -n '.openapi(\|app.on(' apps/server/src/index.ts`.

## Entry points

| Import                          | Holds                                                           | Who reads it                                                      |
| ------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `@workspace/api-mocks`          | fixtures, the MSW handlers, `answerFor` and `workerRequestFrom` | the editor's two suites, and anything that intercepts its own way |
| `@workspace/api-mocks/fixtures` | the payloads and bodies only, no msw import                     | anything that wants a value and no handler                        |
| `@workspace/api-mocks/node`     | `configMockServer`, an `msw/node` server                        | `apps/editor/vitest.setup.ts`, and per-test                       |

`configMockServer` keeps its name from when configs were the only routes there were. It serves the
whole worker, skill index included — `defaultHandlers`, spelled once beside the handlers themselves
so a runner that binds them its own way installs the same list rather than composing a second one.

`./fixtures` names no mocking library, so a consumer that wants a payload and not a handler pays for
neither. It is the entry point the specs read a fixture through, and it is the ONLY one apps/server
can ever use: that suite runs inside workerd through `@cloudflare/vitest-pool-workers`, where
`msw/node` does not load at all. `src/entry-points.test.ts` is that constraint held rather than
described — it makes both msw entry points unloadable and imports `./fixtures` anyway, with the
handlers beside it as the control, since an absence assertion whose mock has stopped intercepting
reads exactly like one that holds.

Derive what each entry point actually costs rather than trusting the table:

```sh
grep -rn "^import" packages/api-mocks/src/fixtures.ts packages/api-mocks/src/answer.ts packages/api-mocks/src/node.ts
```

## What is mocked

The worker's routes, at the statuses something asserts. **The table is an orientation rather than an
inventory** — it was an inventory, it went several handlers short within a fortnight, and it read as
complete the whole time. The set itself is derived:

```sh
grep -n 'http\.\(get\|post\|patch\|delete\)' packages/api-mocks/src/handlers.ts
```

| Route                           | Answer                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /configs`                 | `201` with `{ id }`; any status via `configRefusedHandlerFor` (`503` as `storeRefusedHandler`, `409` in a spec's hands); a dead connection via `configUnreachableHandler`                                                                                                |
| `GET /configs/:id`              | `200` for `STORED_ID`, `500` for `UNREADABLE_CONFIG_ID`, `404` otherwise; one named id via `storedConfigHandlerFor` / `missingConfigHandlerFor`                                                                                                                          |
| `GET /skills`                   | `200` + `x-skill-index: fresh`; `stale` via `staleSkillIndexHandler`; `503` via its unavailable handler                                                                                                                                                                  |
| `GET /api/auth/get-session`     | `200` with `null`; the signed-in session via `signedInHandlers`; a dead connection via `sessionUnreachableHandler`                                                                                                                                                       |
| `POST /api/auth/sign-in/social` | `200` with `{ url }`; `429`, `500`, a body with no `url`, and a dead connection, each its own handler                                                                                                                                                                    |
| `POST /api/auth/sign-out`       | `200`; `500` and a dead connection via their own handlers                                                                                                                                                                                                                |
| `/stacks`, `/stacks/:id`        | `401` on all four verbs; `200`/`201`/`200`/`204` via `signedInHandlers`; `404` on a rename via `stackNotFoundHandler`; the POST refusing at any status via `stackRefusedHandlerFor` (`500` as `stackRefusedHandler`) and a dead connection via `stackUnreachableHandler` |
| `POST /compose`                 | `401`; the proposal via `signedInHandlers`; any status via `composeRefusedHandlerFor` (`429` and `502` each named); a dead connection via `composeUnreachableHandler`                                                                                                    |

GitHub is mocked here too and is deliberately not in that table — a marketplace's catalogue on the
contents API, and an external skill's tree and raw bytes — because it is somebody else's contract
rather than this worker's. The same `grep` above finds it.

`POST /monitoring` is absent: Sentry's SDK tunnels through it and no editor code calls it. `GET
/configs/:id`'s `503` is absent for the same reason nothing else invented here is present — the
client cannot tell it from the `500`, so a test for it would assert the same branch twice.

## Signed in is a state, not a route

Everything the worker gained on 2026-08-29 — the session, the four `/stacks` routes and `/compose` —
sits behind one wrapper, `authenticated` in
[`apps/server/src/auth.ts`](../../apps/server/src/auth.ts). One cookie decides all of it, so the
mocks are split the same way the worker is: the **default** set is the worker answering a browser
that holds no cookie, and `signedInHandlers` flips the whole surface at once.

That is why there is no `signedInStackHandlers`. A set that made the session signed in while
`/stacks` kept answering `401` would describe a worker that cannot exist, and a test written against
it would be asserting about a state production never reaches.

`use()` matches in argument order, so a refusal that can only be reached signed in goes **first**:
`use(stackNotFoundHandler, ...signedInHandlers)`. The other order is shadowed and answers nothing.
`answerFor` resolves through the same matcher, so the Playwright suite reads the same way.

All four stack routes are mocked, including the rename and the delete the editor draws no control
for yet (see the closing note in
[`apps/editor/src/lib/api/stacks.ts`](../../apps/editor/src/lib/api/stacks.ts)). What a route
answers without a cookie is not a function of who calls it, and this package exists so that one
description of the worker is the only one — a half-described worker is where the mock and the worker
get to disagree unobserved.

The 400s `/compose` declares are absent, for the reason `GET /configs/:id`'s `503` is: the client
maps every status it does not name to a single `refused`, so a handler for them would assert the
same branch twice. The refusals that ARE here are exactly the ones a client tells apart —
`ComposeRefusal`, `StackRefusal` and `AuthRefusal` each have a member per handler.

## How Playwright runs the same handlers

A browser cannot be patched the way `msw/node` patches a process, so the Playwright suite intercepts
with `page.route`. That used to mean a SECOND description of this worker, written by hand and free to
disagree — and it did: a blanket route over `/api/auth/**` answered a sign-in with the session body,
which is not a body the worker can send and not one the client can act on.

`answerFor(handlers, request)` is what ended that. It resolves a `Request` against a handler array
through msw's own `getResponse`, and hands back the status, the headers and the BYTES — three
answers rather than a `Response`, because the two that are not a response are not expressible as
one: a request no handler claimed has to fall through to whatever the caller registered before it,
and a dead connection has to abort the request rather than become a status somebody invented.
`apps/editor/e2e/support/stub.ts` is the whole of the INTERCEPTION, and nothing it decides is about
the worker. It is not the whole of that suite's handlers, though, and the exceptions are the point:
`apps/editor/e2e/support/auth.ts` writes three of its own, each a case this package deliberately
does not carry. A stateful `GET`/`POST /stacks` pair, because what a spec asserts is that the save
it just made turns up in the list, and a mock that keeps a list is a second implementation of a
route rather than a description of one. A `/compose` handler that answers only when the test
releases it, because every claim about an in-flight submit is a claim about a window a fulfilled
stub has already closed. And a sign-in refused with prose where the client expects an envelope —
which is a gateway in FRONT of the worker answering, not the worker, and `signInRateLimitedHandler`
is the route's own 429 with no body at all. A handler written there for any other reason is a
second description of this contract.

It adds one thing msw's own interception never has to. A custom response header is hidden from a
cross-origin caller unless the server names it in `access-control-expose-headers`, and an in-process
interceptor is not cross-origin — so `answerFor` applies what `cors()` in
[`apps/server/src/index.ts`](../../apps/server/src/index.ts) applies, for this worker's origin only.
Without it, the browser hands the app an index response with the freshness header silently missing,
which is a third answer the route does not have.

## Three answers for the skill index

The skill index has three answers rather than two because its degraded path is not an error. The
index is built by a daily GitHub Action and published to KV
([`.github/workflows/build-skill-index.yml`](../../.github/workflows/build-skill-index.yml)); the
worker only reads it. When that build stops landing the worker keeps serving what it has, with the
freshness header flipped to `stale` — so a client that reads the header can say the list is ageing,
and one that ignores it still gets usable results. The `503` is the narrow remaining case: no index
has ever been published. It is reachable exactly once in the worker's life, because the published
value carries no expiry.

## How a real server runs the same handlers

Playwright is not the only caller msw cannot intercept for. packages/cli's e2e suite spawns the CLI
as a subprocess, so nothing in-process can patch what it sends and its config store has to stay a
real `node:http` server — see `packages/cli/e2e/fixtures/seed-config-store.ts`. Its request handler
resolves through `answerFor` like any other caller; what it needs first is a `Request`, and what it
holds is an `IncomingMessage`.

`workerRequestFrom(incoming, body?)` is that half, and it lives HERE rather than at the call site for
one reason: **every handler in this package is anchored on `WORKER_ORIGIN`**, while a stub binds a
loopback port. A `Request` built from the request as it arrived matches nothing, and `answerFor`
answers `unhandled` for every route — which reads as a mock with nothing to say rather than as a
mistake. Which handler matches is this package's contract; a caller cannot own it without owning a
copy of it. Two smaller traps go with it: `new Request` refuses a GET carrying a body, and a server
that reads every request's bytes has one for a GET too; and the hop's own headers (`host`,
`content-length` and the rest) describe a connection this request no longer has.

**Applying the answer stays with the caller**, for the same reason `apps/editor/e2e/support/stub.ts`
does. There is no shared shape: Playwright has `route.fulfill` / `fallback` / `abort`, a `node:http`
server has `writeHead` / `end` / `destroy`, and what an `unhandled` answer MEANS is the caller's
decision — the editor's fixture falls through to its third-party guard, and the CLI's store falls
through to the ids its own specs published. A helper here would be this package deciding it.

It takes a structural `IncomingRequest` rather than `http.IncomingMessage`, which is what keeps
`@types/node` out of a package a browser, Node and workerd all read. An `IncomingMessage` satisfies
it as it stands.

## Why the payload is parsed and not asserted

`seedPayload()` runs through `seedPayloadSchema` from `@workspace/matrix/seed`, and `SKILL_INDEX`
through `skillIndexSchema` from `@workspace/matrix/skill-index` — schemas both
the worker and the editor already validate against. The worker validates before it stores and before
it serves, so parsing here is the step the real response has already been through. A fixture
that drifts from the contract fails at import, in every consumer, instead of in whichever assertion
happens to read the field that moved.

It is a builder rather than a constant because the same payload was being re-typed wherever one
field of it had to differ — `seedPayload({ stackId: "next" })`, `seedPayload({ skills })` — and every
copy restated the five fields it was not changing while being free to drift from this one. Overrides
replace rather than merge, so a caller naming `skills` gets exactly the skills it named.
`STORED_PAYLOAD` is `seedPayload()`, the one the config mock serves under `STORED_ID`.

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
