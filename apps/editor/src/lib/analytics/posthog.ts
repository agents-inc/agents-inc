import { env } from "@/env"
import { setAnalyticsSink } from "./track"

// Loaded dynamically, unlike Sentry: an event that arrives late is still the
// same event.
export const initAnalytics = async () => {
  if (!env.VITE_POSTHOG_KEY) return

  const { default: posthog } = await import("posthog-js")

  posthog.init(env.VITE_POSTHOG_KEY, {
    api_host: env.VITE_POSTHOG_HOST,
    defaults: "2026-01-30",

    person_profiles: "identified_only",

    // Off: it would capture text typed into search.
    autocapture: false,
    capture_pageview: false,

    // Each would fetch its own script; none is used here.
    disable_session_recording: true,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    disable_surveys: true,
  })

  setAnalyticsSink(({ name, ...properties }) =>
    posthog.capture(name, properties)
  )
}
