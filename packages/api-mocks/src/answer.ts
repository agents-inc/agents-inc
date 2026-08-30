import { SKILL_INDEX_FRESHNESS_HEADER } from "@workspace/matrix/skill-index"
import { getResponse } from "msw"

import { WORKER_ORIGIN } from "./fixtures"

import type { RequestHandler } from "msw"

// One set of handlers, resolved by whoever cannot use msw's own interception.
//
// The Vitest suite installs these through `msw/node`, which patches the
// process. A browser-driving suite cannot: Playwright intercepts in the
// browser, so its stubs used to be a SECOND description of the same worker,
// written by hand and free to disagree — which is how the Playwright side came
// to answer `POST /api/auth/sign-in/social` with a session body the worker
// cannot produce. `answerFor` is the seam that removes the second description:
// the handlers stay the only statement of what the worker says, and the caller
// supplies only the interception.
//
// It resolves through msw's own `getResponse`, so matching, path parameters and
// argument order behave exactly as they do under `use()`. Nothing about
// matching is reimplemented here.

/**
 * `cors()` in apps/server/src/index.ts names this on every route it covers, and
 * it is the half of the contract `msw/node` can never show: a custom response
 * header is hidden from a cross-origin caller unless the server exposes it, and
 * an in-process interceptor is not cross-origin.
 */
export const EXPOSE_HEADERS_HEADER = "access-control-expose-headers"

/**
 * What a handler said, in the terms an interceptor outside msw needs.
 *
 * Three answers rather than a `Response`, because the two that are not a
 * response are not expressible as one: a request nobody claimed has to reach
 * whatever the caller registered before it, and a dead connection has to be an
 * aborted request rather than a status the caller invents.
 */
export type MockedAnswer =
  | {
      served: true
      status: number
      headers: Record<string, string>
      body: Uint8Array
    }
  | { served: false; reason: "unreachable" | "unhandled" }

/**
 * The worker's CORS response headers, added to what a handler returned.
 *
 * Only for this worker's own origin: GitHub's policy is GitHub's, and a mock
 * that spoke for it would be inventing a third party's contract. Only when the
 * handler named none, so a handler modelling a header the browser never sees
 * still can.
 */
const throughCors = (request: Request, headers: Record<string, string>) => {
  const isWorker = new URL(request.url).origin === WORKER_ORIGIN
  if (!isWorker || EXPOSE_HEADERS_HEADER in headers) return headers

  return { ...headers, [EXPOSE_HEADERS_HEADER]: SKILL_INDEX_FRESHNESS_HEADER }
}

/**
 * What these handlers answer this request with, or why they answered nothing.
 *
 * `Response.error()` — what `HttpResponse.error()` returns — carries a status of
 * 0 and a type of `error`, so it is told apart by the only field that means
 * anything on it.
 */
export const answerFor = async (
  handlers: RequestHandler[],
  request: Request
): Promise<MockedAnswer> => {
  const response = await getResponse(handlers, request)

  if (!response) return { served: false, reason: "unhandled" }
  if (response.type === "error") return { served: false, reason: "unreachable" }

  return {
    served: true,
    status: response.status,
    headers: throughCors(request, Object.fromEntries(response.headers)),
    body: new Uint8Array(await response.arrayBuffer()),
  }
}

/**
 * A request as a `node:http` server received it.
 *
 * Structural rather than `http.IncomingMessage`, which is what keeps
 * `@types/node` out of a package three runtimes read — a browser, Node, and the
 * workerd apps/server's suite runs in. An `IncomingMessage` satisfies it as it
 * stands, so a caller passes one straight through.
 */
export type IncomingRequest = {
  method?: string | undefined
  url?: string | undefined
  headers: Record<string, string | string[] | undefined>
}

/**
 * Headers describing the CONNECTION rather than the request, dropped on the way
 * through.
 *
 * `host` would contradict the origin the URL below is rebuilt on, and
 * `content-length` describes bytes this request may no longer carry, since a
 * GET's body is dropped. Everything else is forwarded: a handler is free to
 * match on any header, and `carriesMarketplaceToken` is the one that does.
 */
const HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "transfer-encoding",
])

/** Node hands a header that arrived twice as an array; fetch's form is one line. */
const asOneLine = (value: string | string[]) =>
  Array.isArray(value) ? value.join(", ") : value

const withoutTheHop = (headers: IncomingRequest["headers"]) =>
  Object.entries(headers).flatMap<[string, string]>(([name, value]) =>
    value === undefined || HOP_HEADERS.has(name)
      ? []
      : [[name, asOneLine(value)]]
  )

/** A GET or a HEAD carrying a body is what `new Request` refuses outright. */
const BODYLESS_METHODS = new Set(["GET", "HEAD"])

/**
 * The Request these handlers match, built from one a `node:http` server
 * received.
 *
 * For callers msw cannot intercept for a second reason: packages/cli's e2e
 * suite spawns the CLI as a subprocess, so its config store has to be a real
 * server rather than anything in-process. `answerFor` takes it from there.
 *
 * The origin is this worker's rather than the one the request arrived on, and
 * that is the whole reason this lives here instead of at the call site: every
 * handler in this package is anchored on `WORKER_ORIGIN`, so a Request carrying
 * the loopback port a stub happened to bind matches none of them and answers
 * `unhandled` for every route — which reads as a mock that has nothing to say
 * rather than as a mistake.
 *
 * `method` and `url` are optional because `IncomingMessage` also models a
 * client's RESPONSE, which has neither; a request a server read always has both.
 */
export const workerRequestFrom = (
  incoming: IncomingRequest,
  body = ""
): Request => {
  const method = incoming.method ?? "GET"
  const carriesBody = body.length > 0 && !BODYLESS_METHODS.has(method)

  return new Request(new URL(incoming.url ?? "/", WORKER_ORIGIN), {
    method,
    headers: withoutTheHop(incoming.headers),
    ...(carriesBody && { body }),
  })
}
