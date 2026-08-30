import { STORED_ID, STORED_PAYLOAD, WORKER_ORIGIN } from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { readSession } from "./auth"
import { authFetch } from "./client"
import { composeProposal } from "./compose"
import { createSharedConfig, fetchSharedConfig } from "./configs"
import { listStacks } from "./stacks"

// One property of every call the editor makes to the worker, asserted in one
// place: the session cookie travels with it.
//
// This is the test that exists because the alternative failure is invisible.
// The session is a cookie on `.agentsinc.sh` set by a different origin, so a
// request that omits `credentials: "include"` is not refused — the browser
// sends it anonymously and drops the cookie on the way back, which looks like
// being signed out for no reason with nothing logged on either side. Nothing
// in a node suite has a cookie jar, so what is checked here is the flag rather
// than the cookie: `request.credentials` is the whole of what this side
// controls, and it is what was missing.
//
// Table-driven rather than five tests, because the point is that the set is
// exhaustive: a new call added to a module here and not to this list is the
// omission the table is shaped to make obvious.

const CREDENTIALS = "include"

const seen = new Map<string, RequestCredentials>()

const remember = (name: string, request: Request) => {
  seen.set(name, request.credentials)
}

const sentHeaders = new Map<string, Headers>()

beforeEach(() => {
  seen.clear()
  sentHeaders.clear()

  // Recorded rather than taken from the default set, because what is under
  // test is the request and `@workspace/api-mocks` describes the responses.
  configMockServer.use(
    http.post(`${WORKER_ORIGIN}/configs`, ({ request }) => {
      remember("createSharedConfig", request)
      return HttpResponse.json({ id: STORED_ID }, { status: 201 })
    }),
    http.get(`${WORKER_ORIGIN}/configs/:id`, ({ request }) => {
      remember("fetchSharedConfig", request)
      return HttpResponse.json(STORED_PAYLOAD)
    }),
    http.get(`${WORKER_ORIGIN}/stacks`, ({ request }) => {
      remember("listStacks", request)
      return HttpResponse.json([])
    }),
    http.post(`${WORKER_ORIGIN}/compose`, ({ request }) => {
      remember("composeProposal", request)
      return HttpResponse.json({ skillIds: [], reason: "" })
    }),
    http.get(`${WORKER_ORIGIN}/api/auth/get-session`, ({ request }) => {
      remember("readSession", request)
      return HttpResponse.json(null)
    }),
    http.post(`${WORKER_ORIGIN}/api/auth/sign-in/social`, ({ request }) => {
      remember("authFetch", request)
      sentHeaders.set("authFetch", request.headers)
      return HttpResponse.json({ url: `${WORKER_ORIGIN}/callback` })
    })
  )
})

const calls = [
  ["createSharedConfig", () => createSharedConfig(STORED_PAYLOAD)],
  ["fetchSharedConfig", () => fetchSharedConfig(STORED_ID)],
  ["listStacks", () => listStacks()],
  ["composeProposal", () => composeProposal("a react app")],
  ["readSession", () => readSession()],
] as const satisfies readonly (readonly [string, () => Promise<unknown>])[]

describe("every call to the worker", () => {
  it.each(calls)("sends the session cookie: %s", async (name, call) => {
    await call()

    expect(seen.get(name)).toBe(CREDENTIALS)
  })
})

// The other half of the same policy, on the one seam where the two could
// disagree.
//
// `authFetch` is the untyped path — Better Auth's routes are mounted with a
// single handler, so there is nothing there for `hc` to type — and it builds
// its request by spreading the session policy over whatever the caller passed.
// Spreading a policy that names `headers` over a caller that also names them
// replaces the caller's, and the caller that loses most by that is `signIn`:
// it posts a JSON body, and a POST that arrives without its `content-type` is
// refused by the worker rather than failing here. Nothing else in the suite
// looks at a request header, so without this the swap reads as green.

describe("the untyped auth seam", () => {
  it("keeps the caller's own headers while adding the session cookie", async () => {
    await authFetch("sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "github" }),
    })

    expect(sentHeaders.get("authFetch")?.get("content-type")).toBe(
      "application/json"
    )
    expect(seen.get("authFetch")).toBe(CREDENTIALS)
  })
})
