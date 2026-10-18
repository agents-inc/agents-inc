import { SKILL_INDEX_FRESHNESS_HEADER } from "@workspace/matrix/skill-index"
import { describe, expect, it } from "vitest"

import { EXPOSE_HEADERS_HEADER, answerFor, workerRequestFrom } from "./answer"
import {
  BINARY_FILE_BYTES,
  EXTERNAL_SKILL,
  GITHUB_AUTHORIZE_URL,
  GITHUB_RAW_ORIGIN,
  MARKETPLACE_TOKEN,
  NO_SESSION,
  SAVED_STACKS,
  STORED_ID,
  STORED_PAYLOAD,
  UNAUTHORIZED_BODY,
  WORKER_EXPOSED_HEADERS,
  WORKER_ORIGIN,
} from "./fixtures"
import {
  authHandlers,
  binarySkillFileHandler,
  carriesMarketplaceToken,
  configHandlers,
  defaultHandlers,
  sessionUnreachableHandler,
  signedInHandlers,
  skillContentsHandlers,
  skillIndexHandlers,
  stackHandlers,
} from "./handlers"

import type { IncomingRequest, MockedAnswer } from "./answer"

const jsonOf = (answer: MockedAnswer): unknown => {
  if (!answer.served) throw new Error(`Not served: ${answer.reason}`)
  return JSON.parse(new TextDecoder().decode(answer.body))
}

const get = (url: string) => new Request(url)

describe("what the handlers answer", () => {
  // A string body with no `content-type` is `text/plain`, which Better Auth refuses.
  const authPost = (path: string, body: unknown = {}) =>
    new Request(`${WORKER_ORIGIN}/api/auth/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })

  it("starts a sign-in with the authorize URL, not a session", async () => {
    const answer = await answerFor(
      authHandlers,
      authPost("sign-in/social", { provider: "github" })
    )

    expect(answer.served && answer.status).toBe(200)
    expect(jsonOf(answer)).toStrictEqual({ url: GITHUB_AUTHORIZE_URL })
  })

  it("signs out when the request carries a JSON body", async () => {
    const answer = await answerFor(authHandlers, authPost("sign-out"))

    expect(answer.served && answer.status).toBe(200)
    expect(jsonOf(answer)).toStrictEqual({ success: true })
  })

  it.each(["sign-out", "sign-in/social"])(
    "refuses %s carrying no JSON content-type, exactly as the worker does",
    async (path) => {
      const answer = await answerFor(
        authHandlers,
        new Request(`${WORKER_ORIGIN}/api/auth/${path}`, {
          method: "POST",
          body: JSON.stringify({}),
        })
      )

      expect(answer.served && answer.status).toBe(415)
    }
  )

  it.each(["sign-out", "sign-in/social"])(
    "refuses %s carrying the header but no parseable body",
    async (path) => {
      const answer = await answerFor(
        authHandlers,
        new Request(`${WORKER_ORIGIN}/api/auth/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
        })
      )

      expect(answer.served && answer.status).toBe(400)
    }
  )

  // Argument order decides, as under `use()`.
  it("lets an earlier handler answer ahead of a later one", async () => {
    const refused = await answerFor(
      stackHandlers,
      get(`${WORKER_ORIGIN}/stacks`)
    )
    expect(refused.served && refused.status).toBe(401)
    expect(jsonOf(refused)).toStrictEqual(UNAUTHORIZED_BODY)

    const listed = await answerFor(
      [...signedInHandlers, ...stackHandlers],
      get(`${WORKER_ORIGIN}/stacks`)
    )
    expect(listed.served && listed.status).toBe(200)
    expect(jsonOf(listed)).toStrictEqual(SAVED_STACKS)
  })

  // A decoder here would mangle exactly the bytes the refusal is about.
  it("carries a body that is not text through unchanged", async () => {
    const answer = await answerFor(
      [binarySkillFileHandler],
      get(`${GITHUB_RAW_ORIGIN}/${EXTERNAL_SKILL.repo}/HEAD/anything`)
    )

    expect(answer.served && answer.body).toStrictEqual(BINARY_FILE_BYTES)
  })
})

// Without the worker's `exposeHeaders`, Chromium hides the freshness header.
describe("what a browser is allowed to read", () => {
  it("exposes the worker's own response headers", async () => {
    const answer = await answerFor(
      skillIndexHandlers,
      get(`${WORKER_ORIGIN}/skills`)
    )

    expect(answer.served && answer.headers).toMatchObject({
      [SKILL_INDEX_FRESHNESS_HEADER]: "fresh",
      [EXPOSE_HEADERS_HEADER]: WORKER_EXPOSED_HEADERS,
    })
  })

  it("says nothing about a third party's headers", async () => {
    const answer = await answerFor(
      skillContentsHandlers,
      get(
        `${GITHUB_RAW_ORIGIN}/${EXTERNAL_SKILL.repo}/HEAD/${EXTERNAL_SKILL.path}/SKILL.md`
      )
    )

    expect(answer.served && EXPOSE_HEADERS_HEADER in answer.headers).toBe(false)
  })
})

describe("what is not an answer at all", () => {
  // The caller must abort rather than fulfil: no worker sends a 0 status.
  it("reports a handler that refuses to answer", async () => {
    const answer = await answerFor(
      [sessionUnreachableHandler],
      get(`${WORKER_ORIGIN}/api/auth/get-session`)
    )

    expect(answer).toStrictEqual({ served: false, reason: "unreachable" })
  })

  // The caller falls back to whatever was registered before it.
  it("reports a request no handler claimed", async () => {
    const answer = await answerFor(
      authHandlers,
      get(`${WORKER_ORIGIN}/nothing-here`)
    )

    expect(answer).toStrictEqual({ served: false, reason: "unhandled" })
  })
})

// A loopback-port request must be re-based on `WORKER_ORIGIN` or it matches nothing.
describe("what a node:http server hands these handlers", () => {
  const arrived = (over: Partial<IncomingRequest> = {}): IncomingRequest => ({
    method: "GET",
    url: `/configs/${STORED_ID}`,
    headers: { host: "127.0.0.1:41234", connection: "keep-alive" },
    ...over,
  })

  it("re-bases a path that arrived on another host onto the worker", async () => {
    const answer = await answerFor(configHandlers, workerRequestFrom(arrived()))

    expect(answer.served && answer.status).toBe(200)
    expect(jsonOf(answer)).toStrictEqual(STORED_PAYLOAD)
  })

  it("keeps the headers a handler matches on and drops the hop's own", () => {
    const request = workerRequestFrom(
      arrived({
        headers: {
          host: "127.0.0.1:41234",
          connection: "keep-alive",
          "content-length": "0",
          authorization: `Bearer ${MARKETPLACE_TOKEN}`,
          "user-agent": "agents-inc",
        },
      })
    )

    expect(carriesMarketplaceToken(request)).toBe(true)
    expect(request.headers.get("user-agent")).toBe("agents-inc")
    expect(request.headers.get("host")).toBeNull()
    expect(request.headers.get("connection")).toBeNull()
    expect(request.headers.get("content-length")).toBeNull()
  })

  it("carries a body a handler would read", async () => {
    const body = JSON.stringify(STORED_PAYLOAD)
    const request = workerRequestFrom(
      arrived({ method: "POST", url: "/configs" }),
      body
    )

    expect(await request.text()).toBe(body)
  })

  // `new Request` refuses a GET with a body, and a server reads an empty one for every GET.
  it("gives a GET no body, whatever arrived with it", () => {
    expect(workerRequestFrom(arrived(), "left over").body).toBeNull()
  })

  it("gives a HEAD no body either", () => {
    expect(
      workerRequestFrom(arrived({ method: "HEAD" }), "left over").body
    ).toBeNull()
  })

  // `new Request` would otherwise invent a `text/plain` content type for the empty string.
  it("gives a request that arrived with no body none", () => {
    const request = workerRequestFrom(arrived({ method: "POST" }))

    expect(request.body).toBeNull()
    expect(request.headers.get("content-type")).toBeNull()
  })

  it("reads a request that arrived with no method as a GET", () => {
    expect(workerRequestFrom(arrived({ method: undefined })).method).toBe("GET")
  })

  // `new Request` keeps both, and neither describes the rebuilt request.
  it("drops the keep-alive and transfer-encoding the hop carried", () => {
    const request = workerRequestFrom(
      arrived({
        headers: { "keep-alive": "timeout=5", "transfer-encoding": "chunked" },
      })
    )

    expect(request.headers.get("keep-alive")).toBeNull()
    expect(request.headers.get("transfer-encoding")).toBeNull()
  })

  it("joins a header that arrived as a list into one line, as HTTP does", () => {
    const request = workerRequestFrom(
      arrived({ headers: { accept: ["text/html", "application/json"] } })
    )

    expect(request.headers.get("accept")).toBe("text/html, application/json")
  })
})

describe("the worker at rest", () => {
  it("answers a first visit with no session", async () => {
    const answer = await answerFor(
      defaultHandlers,
      get(`${WORKER_ORIGIN}/api/auth/get-session`)
    )

    expect(jsonOf(answer)).toBe(NO_SESSION)
  })

  it("and refuses what a cookie unlocks", async () => {
    const answer = await answerFor(
      defaultHandlers,
      get(`${WORKER_ORIGIN}/stacks`)
    )

    expect(answer.served && answer.status).toBe(401)
  })
})
