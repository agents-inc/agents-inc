# @workspace/api-mocks

This package is the one mock of every HTTP surface the editor talks to: the worker (`apps/server`)
and the GitHub hosts that marketplaces and external skills are read from. The editor, CLI and server
suites all resolve against it, so they cannot disagree about what the worker answers. Do not write
a second description of a route anywhere else.

| Import                          | Holds                                                                                 | Read by                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `@workspace/api-mocks`          | the handlers, `defaultHandlers`, `signedInHandlers`, `answerFor`, `workerRequestFrom` | editor suites; CLI unit specs and `packages/cli/e2e/fixtures/seed-config-store.ts`             |
| `@workspace/api-mocks/fixtures` | payloads and bodies only, with no msw import                                          | anything that wants a value                                                                    |
| `@workspace/api-mocks/node`     | `configMockServer`, an `msw/node` server over `defaultHandlers`                       | `apps/editor/vitest.setup.ts`, editor specs and CLI unit specs                                 |

`src/entry-points.test.ts` holds those import boundaries.

## Using it

- **Find what is mocked** with `grep -n 'http\.\(get\|post\|patch\|delete\)' src/handlers.ts`. Find
  what the worker serves with `grep -n '.openapi(\|app.on(' apps/server/src/index.ts`. Add a
  handler only for a status the client handles differently: a status the client maps to the same
  branch as another adds nothing.
- **The default set is a signed-out browser.** `signedInHandlers` switches the session, `/stacks`
  and `/compose` together, because one cookie decides all three (`authenticated` in
  `apps/server/src/auth.ts`).
- **`use()` matches in argument order**, so put a signed-in-only refusal first:
  `use(stackNotFoundHandler, ...signedInHandlers)`.
- **A real `node:http` server** goes through `answerFor(handlers, request)`, which returns a
  status, headers and bytes, or "unhandled", or a dead connection. It also applies the worker's
  CORS `exposeHeaders`, which an in-process mock never needs. Turn an `IncomingMessage` into a
  request with `workerRequestFrom`, because the worker's handlers are anchored on `WORKER_ORIGIN`
  and not on a loopback port. The caller decides what "unhandled" means
  (`apps/editor/e2e/support/install.ts`).
- **The skill index has three answers:** `fresh`, `stale` (`staleSkillIndexHandler`, the daily
  build stopped landing) and `503` (`skillIndexUnavailableHandler`, never published).

## Fixtures

`seedPayload(overrides)` and `SKILL_INDEX` are parsed through the shared schemas in
`@workspace/matrix`, so a fixture that drifts from the contract fails at import. Overrides replace
rather than merge. The schema only checks shape: a fixture must also be installable. `STORED_PAYLOAD`
once parsed while pinning a project-scoped skill to a global sub-agent, which `init --from`
refuses.

Do not import `apps/server`. Its source names wrangler's `Env`, which redefines DOM globals in
whatever imports it.
