import { defineRouteMiddleware } from "@astrojs/starlight/route-data"

import { EDITOR_URL } from "./lib/links"

// The site title links home, and home is the editor: `/` only redirects there.
export const onRequest = defineRouteMiddleware((context) => {
  context.locals.starlightRoute.siteTitleHref = EDITOR_URL
})
