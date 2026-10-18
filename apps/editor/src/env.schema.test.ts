import { describe, expect, it } from "vitest"

import { parseEnv } from "./env.schema"

const PRODUCTION = true
const DEVELOPMENT = false

const API_URL = "https://api.agents-inc.com"
const SENTRY_DSN = "https://key@o1.ingest.sentry.io/2"
const POSTHOG_KEY = "phc_project-key"
const POSTHOG_HOST = "https://eu.i.posthog.com"

// Where a reader of the message is sent.
const FOLLOW_UP =
  "See apps/editor/.env.example for what each one is, and apps/editor/.env.production for the values a production build uses."

describe("parseEnv", () => {
  it("points a development build at the local worker when nothing names one", () => {
    expect(parseEnv({}, DEVELOPMENT)).toStrictEqual({
      VITE_API_URL: "http://localhost:8787",
      VITE_POSTHOG_HOST: "https://us.i.posthog.com",
    })
  })

  it("lets a development build name its own worker", () => {
    expect(parseEnv({ VITE_API_URL: API_URL }, DEVELOPMENT).VITE_API_URL).toBe(
      API_URL
    )
  })

  it("refuses a production build that names no worker, and says which value and where to look", () => {
    expect(() => parseEnv({}, PRODUCTION)).toThrow(
      `Invalid environment: VITE_API_URL (Invalid input: expected string, received undefined). ${FOLLOW_UP}`
    )
  })

  it("names every value it refuses, in one message", () => {
    expect(() =>
      parseEnv(
        { VITE_API_URL: "not a url", VITE_SENTRY_DSN: "not a url" },
        PRODUCTION
      )
    ).toThrow(
      `Invalid environment: VITE_API_URL (Invalid URL), VITE_SENTRY_DSN (Invalid URL). ${FOLLOW_UP}`
    )
  })

  it("carries every value it is given", () => {
    expect(
      parseEnv(
        {
          VITE_API_URL: API_URL,
          VITE_SENTRY_DSN: SENTRY_DSN,
          VITE_POSTHOG_KEY: POSTHOG_KEY,
          VITE_POSTHOG_HOST: POSTHOG_HOST,
        },
        PRODUCTION
      )
    ).toStrictEqual({
      VITE_API_URL: API_URL,
      VITE_SENTRY_DSN: SENTRY_DSN,
      VITE_POSTHOG_KEY: POSTHOG_KEY,
      VITE_POSTHOG_HOST: POSTHOG_HOST,
    })
  })

  // CI substitutes an unset secret with "", which must read as unset.
  it("reads an empty Sentry DSN, PostHog key and PostHog host as unset", () => {
    const env = parseEnv(
      {
        VITE_API_URL: API_URL,
        VITE_SENTRY_DSN: "",
        VITE_POSTHOG_KEY: "",
        VITE_POSTHOG_HOST: "",
      },
      PRODUCTION
    )

    expect([
      env.VITE_SENTRY_DSN,
      env.VITE_POSTHOG_KEY,
      env.VITE_POSTHOG_HOST,
    ]).toStrictEqual([undefined, undefined, "https://us.i.posthog.com"])
  })
})
