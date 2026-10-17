import * as Sentry from "@sentry/react"

import { env } from "@/env"
import { setReportingSink } from "./report"

const TRACE_SAMPLE_RATE = 0.1

// Inert without a DSN.
export const initSentry = () => {
  if (!env.VITE_SENTRY_DSN) return

  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,

    // Through our worker: browsers block `*.ingest.sentry.io` by default.
    tunnel: `${env.VITE_API_URL}/monitoring`,

    integrations: [],
    tracesSampleRate: TRACE_SAMPLE_RATE,

    sendDefaultPii: false,
  })

  setReportingSink({
    issue: (message, context) =>
      Sentry.captureMessage(message, {
        level: "warning",
        ...(context !== undefined && { extra: context }),
      }),
    error: (error, context) =>
      Sentry.captureException(error, {
        ...(context !== undefined && { extra: context }),
      }),
  })
}
