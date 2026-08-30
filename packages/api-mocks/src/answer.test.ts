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

// `answerFor` is what makes the Playwright suite and the Vitest suite ONE mock
// rather than two that agree by hand. Vitest gets these handlers through
// `msw/node`, which intercepts inside the process; Playwright cannot use that —
// it drives a real browser — so it resolves the same handlers here and hands
// the result to `route.fulfill`.
//
// The tests below are therefore about the two things that seam can get wrong:
// which handler answers, and what a browser is allowed to see of the answer.

const jsonOf = (answer: MockedAnswer): unknown => {
  if (!answer.served) throw new Error(`Not served: ${answer.reason}`)
  return JSON.parse(new TextDecoder().decode(answer.body))
}

const get = (url: string) => new Request(url)

describe("what the handlers answer", () => {
  // The disagreement this module exists to end. The Playwright suite used to
  // answer every path under `/api/auth/` with the SESSION body, so a sign-in
  // came back as `null` — a body the worker cannot produce, and one the client
  // reads as "no redirect" rather than as the navigation it is.
  it("starts a sign-in with the authorize URL, not a session", async () => {
    const answer = await answerFor(
      authHandlers,
      new Request(`${WORKER_ORIGIN}/api/auth/sign-in/social`, {
        method: "POST",
        body: JSON.stringify({ provider: "github" }),
      })
    )

    expect(answer.served && answer.status).toBe(200)
    expect(jsonOf(answer)).toStrictEqual({ url: GITHUB_AUTHORIZE_URL })
  })

  // Argument order decides, exactly as `use()` does in the Vitest suite, so one
  // arrangement of the same handlers is what both suites reason about.
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

  // Bytes rather than text, because a skill's directory can hold a file that is
  // not text at all — and a decoder in this seam would substitute replacement
  // characters for exactly the bytes the refusal is about.
  it("carries a body that is not text through unchanged", async () => {
    const answer = await answerFor(
      [binarySkillFileHandler],
      get(`${GITHUB_RAW_ORIGIN}/${EXTERNAL_SKILL.repo}/HEAD/anything`)
    )

    expect(answer.served && answer.body).toStrictEqual(BINARY_FILE_BYTES)
  })
})

// The one thing `msw/node` never shows and a browser always does. The worker
// wraps every route in `cors()` with `exposeHeaders` (apps/server/src/index.ts),
// and without that header Chromium hands the app a response with the freshness
// header silently missing — which is a different answer from either of the two
// the route has.
describe("what a browser is allowed to read", () => {
  it("exposes the worker's own response header", async () => {
    const answer = await answerFor(
      skillIndexHandlers,
      get(`${WORKER_ORIGIN}/skills`)
    )

    expect(answer.served && answer.headers).toMatchObject({
      [SKILL_INDEX_FRESHNESS_HEADER]: "fresh",
      [EXPOSE_HEADERS_HEADER]: SKILL_INDEX_FRESHNESS_HEADER,
    })
  })

  // GitHub is not this worker, so nothing here may speak for its CORS policy.
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
  // A dead connection is not a status. The caller has to abort the request
  // rather than fulfil it, or the app under test sees a 0-status response
  // nobody's worker sends.
  it("reports a handler that refuses to answer", async () => {
    const answer = await answerFor(
      [sessionUnreachableHandler],
      get(`${WORKER_ORIGIN}/api/auth/get-session`)
    )

    expect(answer).toStrictEqual({ served: false, reason: "unreachable" })
  })

  // The caller falls back to whatever was registered before it, which is what
  // keeps the Playwright fixture's third-party guard the last word.
  it("reports a request no handler claimed", async () => {
    const answer = await answerFor(
      authHandlers,
      get(`${WORKER_ORIGIN}/nothing-here`)
    )

    expect(answer).toStrictEqual({ served: false, reason: "unhandled" })
  })
})

// packages/cli's e2e suite spawns the CLI as a subprocess, so nothing in-process
// can intercept what it sends and its config store has to stay a real
// `node:http` server. What arrives there is an IncomingMessage on a loopback
// port; what every handler in this package is anchored on is `WORKER_ORIGIN`.
// Those are two different origins, so a Request built from the request as it
// arrived matches nothing at all — and answers `unhandled` for every route
// rather than failing.
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

  // A handler is free to match on a header — `carriesMarketplaceToken` is the
  // one that does — so what a caller forwards decides which answer comes back.
  // What it must NOT forward is the hop: `host` contradicts the URL above,
  // and `content-length` describes bytes this request no longer carries.
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

  // `new Request` REFUSES a GET that carries a body, and a server that reads
  // every request's bytes has one for a GET too — an empty string. Without this
  // the stub throws on its first read rather than answering it.
  it("gives a GET no body, whatever arrived with it", () => {
    expect(workerRequestFrom(arrived(), "left over").body).toBeNull()
  })
})

// `configMockServer` in ./node composes the resting set for the Vitest suite. A
// Playwright runner that binds these handlers itself needs the same list, and
// composing it a second time is how two suites get to disagree about what a
// first visit sees. One array, spread by both.
describe("the worker at rest", () => {
  it("answers a first visit with no session", async () => {
    const answer = await answerFor(
      defaultHandlers,
      get(`${WORKER_ORIGIN}/api/auth/get-session`)
    )

    expect(jsonOf(answer)).toBe(NO_SESSION)
  })

  // The half that says this is the resting set rather than the signed-in one.
  it("and refuses what a cookie unlocks", async () => {
    const answer = await answerFor(
      defaultHandlers,
      get(`${WORKER_ORIGIN}/stacks`)
    )

    expect(answer.served && answer.status).toBe(401)
  })
})
