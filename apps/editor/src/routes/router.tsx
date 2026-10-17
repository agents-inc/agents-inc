import {
  createRootRoute,
  createRoute,
  createRouter,
  stripSearchParams,
} from "@tanstack/react-router"

import { ConfigureScreen } from "@/features/configure/components/configure-screen"
import { RootLayout, SettingsScreen } from "./route-components"
import { CONFIGURE_SEARCH_DEFAULTS, configureSearchSchema } from "./search"

const rootRoute = createRootRoute({ component: RootLayout })

const configureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: configureSearchSchema,
  search: { middlewares: [stripSearchParams(CONFIGURE_SEARCH_DEFAULTS)] },
  component: ConfigureScreen,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsScreen,
})

const routeTree = rootRoute.addChildren([configureRoute, settingsRoute])

/**
 * Served under /editor. URLs built outside the router (the share link) add the
 * prefix themselves.
 */
export const router = createRouter({ routeTree, basepath: "/editor" })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
