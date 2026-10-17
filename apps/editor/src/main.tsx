import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"

import "@workspace/ui/globals.css"
import { ErrorBoundary } from "@/components/error-boundary"
import { initAnalytics } from "@/lib/analytics/posthog"
import { initSentry } from "@/lib/observability/sentry"
import { router } from "@/routes/router"

// Before render, so a first-paint throw is reported.
initSentry()

// Not awaited: analytics must never delay first paint; earlier events are
// dropped.
void initAnalytics()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>
)
