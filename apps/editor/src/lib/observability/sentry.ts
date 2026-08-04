import * as Sentry from "@sentry/react"

import { env } from "@/env"
import { setReportingSink } from "./report"

// A tenth of sessions is enough to see a trend, and keeps a burst of traffic
// from spending the month's quota in an afternoon.
const TRACE_SAMPLE_RATE = 0.1

// Inert until a DSN exists: without one this returns before touching Sentry,
// the reporting sink stays as it was, and nothing else in the app changes.
// That is what lets the wiring ship before the account does.
export const initSentry = () => {
  if (!env.VITE_SENTRY_DSN) return

  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,

    // Sent through our own worker rather than straight to Sentry, because
    // `*.ingest.sentry.io` is blocked by default in Edge, Safari and Firefox —
    // not just by extensions. Derived from the API URL rather than configured
    // separately, so there is no way to point the two at different places.
    tunnel: `${env.VITE_API_URL}/monitoring`,

    // Explicit rather than default. The editor is one page with no
    // login, so replay and profiling would spend bundle and quota recording
    // someone clicking a grid; stack traces and breadcrumbs are the value.
    integrations: [],
    tracesSampleRate: TRACE_SAMPLE_RATE,

    // No accounts, so no identity to attach — and the only free-text field in
    // the app is the GitHub search box, whose contents are the user's rather
    // than ours. Default-off beats remembering to scrub.
    sendDefaultPii: false,
  })

  setReportingSink({
    issue: (message, context) =>
      Sentry.captureMessage(message, { level: "warning", extra: context }),
    error: (error, context) =>
      Sentry.captureException(error, { extra: context }),
  })
}
