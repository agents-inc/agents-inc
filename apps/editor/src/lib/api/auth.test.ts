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

// The client's half of the auth round trip, against the same mock of the worker
// the Playwright specs draw their session from. What is under test is the
// translation: a status Better Auth answers with becomes either `null`, a
// navigation, or one member of `AuthRefusal`.
//
// Every ending here was proved by a browser round trip or not at all until this
// file existed — which made a refusal path cost a Playwright run to check, and
// meant the two the client deliberately treats as ORDINARY were held in place by
// nothing.

const sink = {
  issue: vi.fn<ReportingSink["issue"]>(),
  error: vi.fn<ReportingSink["error"]>(),
}

// Where the browser is when the button is clicked, and therefore where the
// callback has to put it back. Not the root, deliberately: a fixture whose page
// is `/` cannot tell "came back where you were" from "came back to the app".
const PAGE_URL = "http://localhost:5173/configure"

// `signIn` navigates, and this suite runs in node — there is no `window` to
// navigate. Stubbing one is what lets the assertion be "it left, and for this
// URL" rather than "it returned ok", which is a weaker claim: the result says
// a navigation is under way, and only this says one was actually started.
const assign = vi.fn()

// Better Auth answering with a user the editor cannot draw. Reachable for real
// if the provider ever stops sending a field this app reads, which is exactly
// the case a schema exists for — and the client's answer is `null`, i.e. the
// signed-out state the whole app already works in.
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
  // Two fields out of the many Better Auth sends, and the fixture carries a
  // third so this can say so: `email` arrives and does not survive the parse.
  // The schema stopping where the UI stops is the point — what is not read is
  // not a contract this side has to keep in step.
  it("returns who is signed in, and only what is drawn", async () => {
    configMockServer.use(...signedInHandlers)

    await expect(readSession()).resolves.toStrictEqual({
      user: { id: SIGNED_IN_USER.id, name: SIGNED_IN_USER.name },
    })
  })

  // The resting state, and a 200 rather than a 401: the question has two
  // ordinary answers, so nobody signed in is not a failure to report.
  it("is nobody when nobody is signed in", async () => {
    await expect(readSession()).resolves.toBeNull()
  })

  // A deliberate silence, and the only assertion that holds it in place. An
  // unreachable worker degrades to the experience every first visitor already
  // has, so there is nothing here for a person to act on and nothing worth
  // counting — every visit made offline would otherwise report one.
  it("is nobody when the worker cannot be reached, and reports nothing", async () => {
    configMockServer.use(sessionUnreachableHandler)

    await expect(readSession()).resolves.toBeNull()
    expect(sink.issue).not.toHaveBeenCalled()
  })

  // A body that does not satisfy the schema is signed-out, not a throw. The
  // caller is a render path, so an exception here is a blank app rather than a
  // sign-in button.
  it("is nobody when the answer is not a session", async () => {
    configMockServer.use(notASessionHandler)

    await expect(readSession()).resolves.toBeNull()
  })
})

describe("signIn", () => {
  // `{ ok: true }` is a navigation already under way rather than a page that
  // stayed, so the navigation is what gets asserted.
  it("leaves for the URL the worker minted", async () => {
    await expect(signIn()).resolves.toStrictEqual({ ok: true })
    expect(assign).toHaveBeenCalledWith(GITHUB_AUTHORIZE_URL)
  })

  // The callback URL is where this person is standing, not a constant: sign in
  // from the configurator and the round trip has to end back at it.
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

  // The one auth refusal that names its own fix — waiting is the whole of it —
  // which is why it is a member of its own rather than folded into `refused`.
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

  // A 200 carrying no `url`, which is its own ending and not a variant of the
  // one above: nothing about the status says the browser is not about to leave,
  // so the only thing that can notice it stayed is this branch.
  it("refuses a success carrying nowhere to go, and stays on the page", async () => {
    configMockServer.use(signInWithoutRedirectHandler)

    await expect(signIn()).resolves.toStrictEqual({
      ok: false,
      refusal: "refused",
    })
    expect(assign).not.toHaveBeenCalled()
    // The message alone, for the reason the unreachable cases below use it:
    // `reportIssue` forwards an absent context as an explicit `undefined`, so
    // naming the message on its own is what keeps the assertion about the
    // message.
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
    // The message alone, matching `configs.test.ts`: this one carries no
    // context, and what is worth pinning is that it is reported under its own
    // name rather than as one of the refusals above.
    expect(sink.issue.mock.calls.map(([message]) => message)).toStrictEqual([
      "Sign-in could not reach the worker",
    ])
  })
})

describe("signOut", () => {
  // Now a real assertion rather than a formality. It passed for the whole life
  // of the feature while sign-out had never once worked, because the mock
  // answered `{ success: true }` to any request at all; it holds the client to
  // Better Auth's entry conditions since `requiringJson` landed in
  // `@workspace/api-mocks`. Drop either half of the request below and this
  // reddens.
  it("returns to signed out", async () => {
    configMockServer.use(...signedInHandlers)

    await expect(signOut()).resolves.toStrictEqual({ ok: true })
  })

  // The shape itself, asserted directly, because the row above proves only that
  // SOMETHING acceptable was sent. Better Auth refuses a POST with no
  // `content-type: application/json` at 415 and one with the header but no body
  // at 400 — measured against `wrangler dev` — and this call site sent neither
  // while `signIn` sent both. That asymmetry was the defect: it answered 415 in
  // every environment, `refusalOf` read that as `refused`, and the rail
  // reported it in sign-in's words.
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
