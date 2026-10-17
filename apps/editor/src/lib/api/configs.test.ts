import {
  CONFIGS_URL,
  CONFIG_WRITE_WINDOW_SECONDS,
  DEAD_LINK_ID,
  OUT_OF_SCOPE_PAYLOAD,
  TOO_MANY,
  STORED_ID,
  STORED_PAYLOAD,
  UNREADABLE_CONFIG_ID,
  configRateLimitedHandler,
  configUnreachableHandler,
  storeRefusedHandler,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import type { ReportingSink } from "@/lib/observability/report"

import { createSharedConfig, fetchSharedConfig } from "./configs"

const sink = {
  issue: vi.fn<ReportingSink["issue"]>(),
  error: vi.fn<ReportingSink["error"]>(),
}

const staleBundleHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(
    "Reload the page: this configuration names another version of the sharing contract",
    // hono's `c.text` sends the charset; match it.
    { status: 409, headers: { "content-type": "text/plain; charset=UTF-8" } }
  )
)

// Left resting at global by `OUT_OF_SCOPE_PAYLOAD`; the contract's refusal
// names it.
const RESTING_AGENT = "web-developer"
// The skill half of the pair, which lives in the issue path.
const UNWRITABLE_SKILL = "web-framework-react"

// Proves a request was never made.
const witnessedMint = (witness: () => void) =>
  http.post(CONFIGS_URL, () => {
    witness()
    return HttpResponse.json({ id: STORED_ID }, { status: 201 })
  })

beforeEach(() => {
  setReportingSink(sink)
})

describe("createSharedConfig", () => {
  it("returns the id the worker minted", async () => {
    const result = await createSharedConfig(STORED_PAYLOAD)

    expect(result).toStrictEqual({ ok: true, id: STORED_ID })
  })

  it("reads a refused write as a refusal nobody can act on", async () => {
    configMockServer.use(storeRefusedHandler)

    const result = await createSharedConfig(STORED_PAYLOAD)

    expect(result).toStrictEqual({ ok: false, refusal: "refused" })
    expect(sink.issue).toHaveBeenCalledWith("Share POST rejected", {
      status: 503,
    })
  })

  it("reads the rate limit as a refusal that says when to try again", async () => {
    configMockServer.use(configRateLimitedHandler)

    const result = await createSharedConfig(STORED_PAYLOAD)

    expect(result).toStrictEqual({
      ok: false,
      refusal: "refused",
      retryAfterSeconds: CONFIG_WRITE_WINDOW_SECONDS,
    })
    expect(sink.issue).toHaveBeenCalledWith("Share POST hit the rate limit", {
      retryAfterSeconds: CONFIG_WRITE_WINDOW_SECONDS,
    })
  })

  it("reads a 429 that names no window as a plain refusal", async () => {
    configMockServer.use(
      http.post(CONFIGS_URL, () => new HttpResponse(null, { status: TOO_MANY }))
    )

    const result = await createSharedConfig(STORED_PAYLOAD)

    expect(result).toStrictEqual({ ok: false, refusal: "refused" })
    expect(sink.issue).toHaveBeenCalledWith("Share POST rejected", {
      status: TOO_MANY,
    })
  })

  it("reads a 409 as this page being out of date", async () => {
    configMockServer.use(staleBundleHandler)

    const result = await createSharedConfig(STORED_PAYLOAD)

    expect(result).toStrictEqual({ ok: false, refusal: "out-of-date" })
  })

  it("reports a stale bundle apart from a worker that refused", async () => {
    configMockServer.use(staleBundleHandler)

    await createSharedConfig(STORED_PAYLOAD)

    expect(sink.issue).toHaveBeenCalledWith("Share POST refused a stale page", {
      status: 409,
    })
  })

  it("refuses a configuration nobody could install", async () => {
    const result = await createSharedConfig(OUT_OF_SCOPE_PAYLOAD)

    expect(result).toStrictEqual({ ok: false, refusal: "unwritable" })
  })

  it("refuses it without spending a write", async () => {
    const reachedTheWorker = vi.fn<Parameters<typeof witnessedMint>[0]>()
    configMockServer.use(witnessedMint(reachedTheWorker))

    await createSharedConfig(OUT_OF_SCOPE_PAYLOAD)

    expect(reachedTheWorker).not.toHaveBeenCalled()
  })

  // Both halves: the message names the sub-agent, only the path names the
  // skill.
  it("reports both the skill and the sub-agent the write contract objected to", async () => {
    await createSharedConfig(OUT_OF_SCOPE_PAYLOAD)

    expect(sink.issue).toHaveBeenCalledWith(
      "Share POST refused a configuration nobody could install",
      {
        problems: [expect.stringContaining(UNWRITABLE_SKILL) as unknown],
      }
    )
    const [, context] = sink.issue.mock.calls[0]!
    const { problems } = context as { problems: string[] }
    expect(problems[0]).toContain(RESTING_AGENT)
  })

  it("lets a payload the write contract accepts through to the worker", async () => {
    const reachedTheWorker = vi.fn<Parameters<typeof witnessedMint>[0]>()
    configMockServer.use(witnessedMint(reachedTheWorker))

    const result = await createSharedConfig(STORED_PAYLOAD)

    expect(result).toStrictEqual({ ok: true, id: STORED_ID })
    expect(reachedTheWorker).toHaveBeenCalledOnce()
  })

  it("reads an unreachable worker as its own refusal", async () => {
    configMockServer.use(configUnreachableHandler)

    const result = await createSharedConfig(STORED_PAYLOAD)

    expect(result).toStrictEqual({ ok: false, refusal: "unreachable" })
    expect(sink.issue.mock.calls.map(([message]) => message)).toStrictEqual([
      "Share POST could not reach the worker",
    ])
  })
})

describe("fetchSharedConfig", () => {
  it("returns the stored payload", async () => {
    const result = await fetchSharedConfig(STORED_ID)

    expect(result).toStrictEqual({ ok: true, payload: STORED_PAYLOAD })
  })

  it("reads a dead link as a dead link and reports nothing", async () => {
    const result = await fetchSharedConfig(DEAD_LINK_ID)

    expect(result).toStrictEqual({
      ok: false,
      error: "this share link points to nothing",
    })
    expect(sink.issue).not.toHaveBeenCalled()
  })

  it("reads an unreadable stored config as a failure carrying the status", async () => {
    const result = await fetchSharedConfig(UNREADABLE_CONFIG_ID)

    expect(result).toStrictEqual({
      ok: false,
      error: "loading the shared config failed (500)",
    })
    expect(sink.issue).toHaveBeenCalledWith("Share GET failed", { status: 500 })
  })
})
