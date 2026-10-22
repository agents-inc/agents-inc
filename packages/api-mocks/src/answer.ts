import { getResponse } from "msw"

import { WORKER_EXPOSED_HEADERS, WORKER_ORIGIN } from "./fixtures"

import type { RequestHandler } from "msw"

// Resolves the handlers for interceptors outside msw (Playwright, a node:http stub) through msw's
// own `getResponse`, so matching behaves exactly as under `use()`.

/** In-process `msw/node` is never cross-origin, so it cannot show this header's effect. */
export const EXPOSE_HEADERS_HEADER = "access-control-expose-headers"

/** Unclaimed requests fall through and dead connections abort; neither is a `Response`. */
export type MockedAnswer =
  | {
      served: true
      status: number
      headers: Record<string, string>
      body: Uint8Array
    }
  | { served: false; reason: "unreachable" | "unhandled" }

const throughCors = (request: Request, headers: Record<string, string>) => {
  const isWorker = new URL(request.url).origin === WORKER_ORIGIN
  if (!isWorker || EXPOSE_HEADERS_HEADER in headers) return headers

  return { ...headers, [EXPOSE_HEADERS_HEADER]: WORKER_EXPOSED_HEADERS }
}

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

/** Structural rather than `http.IncomingMessage`, keeping `@types/node` out of this package. */
export type IncomingRequest = {
  method?: string | undefined
  url?: string | undefined
  headers: Record<string, string | string[] | undefined>
}

// `host` would contradict the rebuilt origin, `content-length` a dropped body.
const HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "transfer-encoding",
])

const asOneLine = (value: string | string[]) =>
  Array.isArray(value) ? value.join(", ") : value

const withoutTheHop = (headers: IncomingRequest["headers"]) =>
  Object.entries(headers).flatMap<[string, string]>(([name, value]) =>
    value === undefined || HOP_HEADERS.has(name)
      ? []
      : [[name, asOneLine(value)]]
  )

// `new Request` refuses a body on these.
const BODYLESS_METHODS = new Set(["GET", "HEAD"])

/**
 * Rebuilt on `WORKER_ORIGIN`, which every handler is anchored on: the loopback port a stub bound
 * would match none of them.
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
