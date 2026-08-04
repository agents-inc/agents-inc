import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"

import "@workspace/ui/globals.css"
import { ErrorBoundary } from "@/components/error-boundary"
import { initAnalytics } from "@/lib/analytics/posthog"
import { initSentry } from "@/lib/observability/sentry"
import { router } from "@/routes/router"

// Before render, so a throw during the first paint is still reported.
initSentry()

// Deliberately not awaited: analytics loads its SDK dynamically and must
// never hold up the first paint. Events emitted before it resolves go to the
// no-op sink and are lost, which is the correct trade — a dropped
// `stack_applied` costs a row in a funnel, a blocked render costs the visit.
void initAnalytics()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>
)
