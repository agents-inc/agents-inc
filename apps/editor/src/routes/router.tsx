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
 * `basepath` because the editor is served from `agentsinc.sh/editor`, not from
 * the apex — the apex is the landing page, and `/docs` is Starlight, both on
 * the `agents-inc-www` Worker.
 *
 * It is one option doing two jobs, and both matter. On the way IN it strips the
 * prefix off `window.location` before matching, so a hard refresh on
 * `/editor/settings` resolves to `/settings` and finds its route; on the way OUT
 * it re-adds the prefix when building every `href`, so a `<Link>` stays inside
 * this Worker. Without it the app renders links at the origin root, which now
 * belong to a different Worker entirely.
 *
 * WHAT IT DOES NOT COVER: anything that builds a URL without going through the
 * router. The share link is the one that matters
 * (features/configure/lib/use-share-link.ts) and it carries the prefix itself.
 */
export const router = createRouter({ routeTree, basepath: "/editor" })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
