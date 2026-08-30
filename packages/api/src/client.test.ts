import { describe, expect, it } from "vitest"

import { apiRequestInit, createApiClient } from "./client"

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
