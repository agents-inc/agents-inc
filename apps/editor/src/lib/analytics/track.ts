import type { AnalyticsEvent } from "./events"

// Vendor-free, so stores and components can emit without loading an SDK.
export type AnalyticsSink = (event: AnalyticsEvent) => void

let sink: AnalyticsSink = () => {}

export const setAnalyticsSink = (next: AnalyticsSink) => {
  sink = next
}

export const track = (event: AnalyticsEvent) => sink(event)
