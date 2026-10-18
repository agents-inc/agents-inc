import {
  GITHUB_AUTHORIZE_URL,
  SESSION_URL,
  SIGNED_IN_USER,
  SIGN_IN_URL,
  SIGN_OUT_URL,
  sessionUnreachableHandler,
  signInRateLimitedHandler,
  signInRefusedHandler,
  signInUnreachableHandler,
  signInWithoutRedirectHandler,
  signOutRefusedHandler,
  signOutUnreachableHandler,
  signedInHandlers,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import type { ReportingSink } from "@/lib/observability/report"

import { readSession, signIn, signOut } from "./auth"

const sink = {
  issue: vi.fn<ReportingSink["issue"]>(),
  error: vi.fn<ReportingSink["error"]>(),
}

// Not the root, so the test can tell "came back where you were" from "came back
// to the app".
const PAGE_URL = "http://localhost:5173/configure"

// Node has no `window`; stubbing one proves a navigation started.
const assign = vi.fn()

const notASessionHandler = http.get(SESSION_URL, () =>
  HttpResponse.json({ user: { id: "u_1" } })
)

const TOO_MANY = 429
const REFUSED = 500

beforeEach(() => {
  setReportingSink(sink)
  vi.stubGlobal("window", { location: { href: PAGE_URL, assign } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("readSession", () => {
  it("returns who is signed in, and only what is drawn", async () => {
    configMockServer.use(...signedInHandlers)

    await expect(readSession()).resolves.toStrictEqual({
      user: { id: SIGNED_IN_USER.id, name: SIGNED_IN_USER.name },
    })
  })

  it("is nobody when nobody is signed in", async () => {
    await expect(readSession()).resolves.toBeNull()
  })

  it("is nobody when the worker cannot be reached, and reports nothing", async () => {
    configMockServer.use(sessionUnreachableHandler)

    await expect(readSession()).resolves.toBeNull()
    expect(sink.issue).not.toHaveBeenCalled()
  })

  it("is nobody when the answer is not a session", async () => {
    configMockServer.use(notASessionHandler)

    await expect(readSession()).resolves.toBeNull()
  })
})

describe("signIn", () => {
  it("leaves for the URL the worker minted", async () => {
    await expect(signIn()).resolves.toStrictEqual({ ok: true })
    expect(assign).toHaveBeenCalledWith(GITHUB_AUTHORIZE_URL)
  })

  it("asks for GitHub, and for the page to come back to", async () => {
    const sent: unknown[] = []
    configMockServer.use(
      http.post(SIGN_IN_URL, async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json({ url: GITHUB_AUTHORIZE_URL })
      })
    )

    await signIn()

    expect(sent).toStrictEqual([{ provider: "github", callbackURL: PAGE_URL }])
  })

  it("tells a rate limit apart from a refusal", async () => {
    configMockServer.use(signInRateLimitedHandler)

    await expect(signIn()).resolves.toStrictEqual({
      ok: false,
      refusal: "too-many",
    })
    expect(sink.issue).toHaveBeenCalledWith("Sign-in refused", {
      status: TOO_MANY,
    })
  })

  it("reads a worker that would not start the flow as a refusal", async () => {
    configMockServer.use(signInRefusedHandler)

    await expect(signIn()).resolves.toStrictEqual({
      ok: false,
      refusal: "refused",
    })
    expect(sink.issue).toHaveBeenCalledWith("Sign-in refused", {
      status: REFUSED,
    })
  })

  it("refuses a success carrying nowhere to go, and stays on the page", async () => {
    configMockServer.use(signInWithoutRedirectHandler)

    await expect(signIn()).resolves.toStrictEqual({
      ok: false,
      refusal: "refused",
    })
    expect(assign).not.toHaveBeenCalled()
    // The message alone: `reportIssue` forwards an absent context as an
    // explicit `undefined`.
    expect(sink.issue.mock.calls.map(([message]) => message)).toStrictEqual([
      "Sign-in returned no redirect",
    ])
  })

  it("separates never getting an answer from being refused", async () => {
    configMockServer.use(signInUnreachableHandler)

    await expect(signIn()).resolves.toStrictEqual({
      ok: false,
      refusal: "unreachable",
    })
    expect(sink.issue.mock.calls.map(([message]) => message)).toStrictEqual([
      "Sign-in could not reach the worker",
    ])
  })
})

describe("signOut", () => {
  it("returns to signed out", async () => {
    configMockServer.use(...signedInHandlers)

    await expect(signOut()).resolves.toStrictEqual({ ok: true })
  })

  // Better Auth answers 415 without `content-type` and 400 without a body.
  it("sends the JSON content-type and a body the worker can parse", async () => {
    const sent: { contentType: string | null; body: string }[] = []
    configMockServer.use(
      ...signedInHandlers,
      http.post(SIGN_OUT_URL, async ({ request }) => {
        sent.push({
          contentType: request.headers.get("content-type"),
          body: await request.text(),
        })
        return HttpResponse.json({ success: true })
      })
    )

    await signOut()

    expect(sent).toStrictEqual([
      { contentType: "application/json", body: "{}" },
    ])
    expect(JSON.parse(sent[0]?.body ?? "")).toStrictEqual({})
  })

  it("reads a worker that would not sign out as a refusal", async () => {
    configMockServer.use(signOutRefusedHandler)

    await expect(signOut()).resolves.toStrictEqual({
      ok: false,
      refusal: "refused",
    })
    expect(sink.issue).toHaveBeenCalledWith("Sign-out refused", {
      status: REFUSED,
    })
  })

  it("separates never getting an answer from being refused", async () => {
    configMockServer.use(signOutUnreachableHandler)

    await expect(signOut()).resolves.toStrictEqual({
      ok: false,
      refusal: "unreachable",
    })
    expect(sink.issue.mock.calls.map(([message]) => message)).toStrictEqual([
      "Sign-out could not reach the worker",
    ])
  })
})

// Only an answer the worker stood behind signs anyone in.
describe("readSession on a refused answer", () => {
  it("reads it as signed out even when its body names a user", async () => {
    configMockServer.use(
      http.get(SESSION_URL, () =>
        HttpResponse.json({ user: SIGNED_IN_USER }, { status: REFUSED })
      )
    )

    expect(await readSession()).toBeNull()
  })
})
