import { STORED_ID, STORED_PAYLOAD, WORKER_ORIGIN } from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { readSession } from "./auth"
import { authFetch } from "./client"
import { composeProposal } from "./compose"
import { createSharedConfig, fetchSharedConfig } from "./configs"
import { listStacks } from "./stacks"

// No cookie jar in node, so the flag is checked rather than the cookie.

const CREDENTIALS = "include"

const seen = new Map<string, RequestCredentials>()

const remember = (name: string, request: Request) => {
  seen.set(name, request.credentials)
}

const sentHeaders = new Map<string, Headers>()

beforeEach(() => {
  seen.clear()
  sentHeaders.clear()

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

// Spreading the policy over caller headers would replace them.

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
