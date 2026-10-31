import { docsLoader } from "@astrojs/starlight/loaders"
import { docsSchema } from "@astrojs/starlight/schema"
import { defineCollection } from "astro:content"

import { withReleasePages } from "./lib/release-pages"

// Required, or the build silently emits no docs pages. Pages sit one level
// deeper at src/content/docs/docs/ so they serve under /docs.
export const collections = {
  docs: defineCollection({
    loader: withReleasePages(docsLoader()),
    schema: docsSchema(),
  }),
}
