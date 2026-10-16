import { describe, expect, expectTypeOf, it } from "vitest"

import { apiRequestInit, createApiClient, retryAfterSeconds } from "./client"

import type { ApiClient } from "./client"

const BASE = "https://api.example.test"

type Call = { url: string; init: RequestInit }

/**
 * The whole of what this package produces is the argument pair it hands
 * `fetch`, so that is what every test here reads. hc calls
 * `(opt?.fetch || fetch)(url, { body, method, headers, ...opt?.init })`, which is why
 * injecting one is enough to see the base URL, the headers and the
 * credentials policy without a server or a network.
 */
const urlOf = (input: Parameters<typeof globalThis.fetch>[0]) =>
  input instanceof Request ? input.url : String(input)

const recordingFetch = () => {
  const calls: Call[] = []
  const fetch: typeof globalThis.fetch = (input, init) => {
    calls.push({ url: urlOf(input), init: init ?? {} })
    return Promise.resolve(
      new Response("{}", { headers: { "content-type": "application/json" } })
    )
  }
  return { calls, fetch }
}

/** hc builds a `Headers` for the request; this reads one back by name. */
const headerOf = (init: RequestInit, name: string) =>
  new Headers(init.headers).get(name)

const firstCall = (calls: Call[]) => {
  const call = calls[0]
  if (!call) throw new Error("the client never called fetch")
  return call
}

describe("createApiClient", () => {
  it("resolves a path parameter against the configured base URL", async () => {
    const { calls, fetch } = recordingFetch()
    const client = createApiClient({ baseUrl: BASE, fetch })

    await client.configs[":id"].$get({ param: { id: "Ab3xY9_Q" } })

    expect(firstCall(calls).url).toBe(`${BASE}/configs/Ab3xY9_Q`)
  })

  it("carries the session cookie when no caller says otherwise", async () => {
    const { calls, fetch } = recordingFetch()
    const client = createApiClient({ baseUrl: BASE, fetch })

    await client.configs[":id"].$get({ param: { id: "Ab3xY9_Q" } })

    expect(firstCall(calls).init.credentials).toBe("include")
  })

  it("lets a caller with no cookie jar opt out by name", async () => {
    const { calls, fetch } = recordingFetch()
    const client = createApiClient({
      baseUrl: BASE,
      credentials: "omit",
      fetch,
    })

    await client.configs[":id"].$get({ param: { id: "Ab3xY9_Q" } })

    expect(firstCall(calls).init.credentials).toBe("omit")
  })

  it("sends the headers it was configured with on every request", async () => {
    const { calls, fetch } = recordingFetch()
    const client = createApiClient({
      baseUrl: BASE,
      headers: { "user-agent": "agents-inc-cli" },
      fetch,
    })

    await client.configs[":id"].$get({ param: { id: "Ab3xY9_Q" } })

    expect(headerOf(firstCall(calls).init, "user-agent")).toBe("agents-inc-cli")
  })

  it("leaves the content type hc sets for a JSON body alone", async () => {
    const { calls, fetch } = recordingFetch()
    const client = createApiClient({
      baseUrl: BASE,
      headers: { "user-agent": "agents-inc-cli" },
      fetch,
    })

    await client.stacks.$post({ json: { name: "Web", configId: "Ab3xY9_Q" } })

    const { init } = firstCall(calls)
    expect(headerOf(init, "content-type")).toBe("application/json")
    expect(headerOf(init, "user-agent")).toBe("agents-inc-cli")
  })
})

describe("apiRequestInit", () => {
  it("carries the session cookie when no caller says otherwise", () => {
    expect(apiRequestInit({}).credentials).toBe("include")
  })

  it("lets a caller with no cookie jar opt out by name", () => {
    expect(apiRequestInit({ credentials: "omit" }).credentials).toBe("omit")
  })

  it("carries the headers it was given", () => {
    const init = apiRequestInit({ headers: { "user-agent": "agents-inc-cli" } })

    expect(headerOf(init, "user-agent")).toBe("agents-inc-cli")
  })

  it("cannot be spread over a caller's own init and lose the cookie", () => {
    const merged: RequestInit = { method: "POST", ...apiRequestInit({}) }

    expect(merged.credentials).toBe("include")
    expect(merged.method).toBe("POST")
  })
})

/** What `POST /configs` can answer, as the typed client sees it. */
type CreateConfigStatus = Awaited<
  ReturnType<ApiClient["configs"]["$post"]>
>["status"]

/** A refusal as the worker's write limiter sends it, window and all. */
const rateLimited = (retryAfter?: string) =>
  new Response("Too many requests", {
    status: 429,
    headers: retryAfter === undefined ? {} : { "retry-after": retryAfter },
  })

describe("retryAfterSeconds", () => {
  // A status the route does not declare is one the typed client cannot be
  // asked about: `response.status === 429` fails to compile against it, so a
  // consumer could only ever read the limit as an anonymous refusal.
  it("reads a status the typed client knows POST /configs can answer", () => {
    expectTypeOf<429>().toExtend<CreateConfigStatus>()
  })

  it("reads the window a rate-limited write was refused for", () => {
    expect(retryAfterSeconds(rateLimited("60"))).toBe(60)
  })

  it("says nothing when the refusal says nothing", () => {
    expect(retryAfterSeconds(rateLimited())).toBeNull()
  })

  // RFC 9110 also allows an HTTP-date. No route of this worker sends one, and
  // guessing a clock difference would be a second opinion on when to retry.
  it("says nothing for a window it cannot read as whole seconds", () => {
    const unreadable = ["Wed, 21 Oct 2026 07:28:00 GMT", "", "-5", "0", "1.5"]

    expect(
      unreadable.map((value) => retryAfterSeconds(rateLimited(value)))
    ).toStrictEqual(unreadable.map(() => null))
  })
})
