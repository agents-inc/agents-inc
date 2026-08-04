import type { AnalyticsEvent } from "./events"

// Same shape as `lib/observability/report.ts`, and for the same reason: this
// module imports no vendor, so a store or a component can emit an event
// without its unit tests loading an analytics SDK — and without the 128 E2E
// specs posting to a real project on every run.
export type AnalyticsSink = (event: AnalyticsEvent) => void

// No-op until something is listening. Unlike error reporting, there is no
// development console fallback: a stream of events in the console while
// working on the grid is noise, not information.
let sink: AnalyticsSink = () => {}

export const setAnalyticsSink = (next: AnalyticsSink) => {
  sink = next
}

export const track = (event: AnalyticsEvent) => sink(event)
