import { docsLoader } from "@astrojs/starlight/loaders"
import { docsSchema } from "@astrojs/starlight/schema"
import { defineCollection } from "astro:content"

/**
 * Required, and not created by Starlight's installer. Without it Astro has no
 * `docs` collection at all: the build reports the collection as empty and
 * emits no documentation pages, without failing.
 *
 * The loader's base is `src/content/docs/`. Everything it finds is served from
 * the site root, which is why this project's pages sit one directory deeper at
 * `src/content/docs/docs/` — see the comment on `sidebar` in astro.config.ts.
 */
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
}
