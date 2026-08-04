import starlight from "@astrojs/starlight"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"

const GITHUB_REPO_URL = "https://github.com/agents-inc/agents-inc"
const SKILLS_REPO_URL = "https://github.com/agents-inc/skills"
const CHANGELOG_URL = `${GITHUB_REPO_URL}/releases`

/**
 * One build serves two things: the marketing landing page at `/`, from
 * `src/pages/`, and the Starlight documentation at `/docs`, from the `docs`
 * content collection.
 *
 * NO REACT INTEGRATION, DELIBERATELY. Please do not "fix" this by adding
 * `@astrojs/react`.
 *
 *   1. The only thing this site needs from the design system is its *tokens*,
 *      which are plain CSS custom properties in `@workspace/ui`'s globals.css.
 *      No React is required to consume them. The landing page is `.astro` plus
 *      Tailwind; the docs are Starlight's own components.
 *   2. This monorepo runs two React majors on purpose — packages/cli needs
 *      React 18 for Ink, apps/editor is on 19 — and React 18 won the hoisted
 *      root slot. That already forced `paths` workarounds in packages/ui and
 *      apps/editor to collapse the duplicate @types/react copies back to one.
 *      Depending on no React at all means this workspace inherits none of it.
 *
 * If a genuinely interactive island is needed later, this is one integration
 * and one dependency away — and at that point the React-major question above
 * has to be answered for this workspace too.
 */
export default defineConfig({
  /**
   * The deployed origin. Two things need it and neither can guess: the sitemap
   * integration Starlight bundles skips itself entirely without it, and
   * Starlight's canonical and Open Graph URLs are absolute, so they are simply
   * not emitted until this is set.
   *
   * THIS IS NOT YET WHERE THIS BUILD IS SERVED FROM. `agentsinc.sh` today
   * serves the editor, and this site is not deployed anywhere. The value
   * is the settled destination rather than the current state: WWW-03 in
   * todo/www.md records the decision, and carries the old identifier this
   * comment used to cite (item 10 of docs/web/editor-todo.md) — one hostname,
   * split by path, with `agentsinc.sh/` the landing page here, `/docs` these
   * docs, and the editor moving to `agentsinc.sh/editor`. Both paths this
   * build owns sit at the root of that hostname, so no `base` is needed and the
   * URLs generated from this are already the ones that will be correct.
   */
  site: "https://agentsinc.sh",

  output: "static",

  /**
   * Starlight turns on site-wide prefetching by default (see its `prefetch:
   * config.prefetch ?? { prefetchAll: true }`), which injects ~2.5 KB of
   * script into *every* page — including the landing page, which is a single
   * static document with nothing to prefetch. Setting it here wins, because
   * Starlight only fills in a default when the key is absent.
   */
  prefetch: false,

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [
    starlight({
      title: "Agents Inc",

      /**
       * Starlight's 404 route is registered at `/404` for the *whole* site,
       * not just `/docs`, so it would style the landing page's not-found with
       * the docs chrome. Disabled here in favour of the hand-built
       * `src/pages/404.astro`.
       */
      disable404Route: true,

      social: [
        { icon: "github", label: "GitHub", href: GITHUB_REPO_URL },
        { icon: "seti:plan", label: "Skills", href: SKILLS_REPO_URL },
      ],

      customCss: ["./src/styles/site.css"],

      /**
       * A single, light theme. See src/styles/site.css for the colour mapping
       * and src/components/theme-provider.astro for why the toggle is gone.
       */
      components: {
        ThemeProvider: "./src/components/theme-provider.astro",
        ThemeSelect: "./src/components/theme-select.astro",
      },

      /**
       * THE `docs/` SEGMENT IN EVERY PATH BELOW IS NOT A TYPO.
       *
       * Starlight's content lives in the `docs` collection, whose root is
       * `src/content/docs/`. Everything under that root is served from the
       * site root — so a file at `src/content/docs/why.md` would claim `/why`,
       * and `src/content/docs/index.md` would claim `/`, colliding with the
       * landing page.
       *
       * Nesting the content one level deeper, at `src/content/docs/docs/…`,
       * is Starlight's documented way to mount the whole documentation at a
       * subpath: the extra directory becomes the first slug segment, so the
       * same file at `src/content/docs/docs/why.md` is served at `/docs/why`
       * and nothing is generated for `/`.
       *
       * The sidebar's `slug` and `autogenerate.directory` values are slugs and
       * collection-relative paths respectively, so they carry that segment too
       * — `docs/guides`, never `guides`.
       */
      sidebar: [
        {
          label: "Start here",
          items: [
            { slug: "docs/why" },
            { slug: "docs/quickstart" },
            { slug: "docs/cli-or-web" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { slug: "docs/concepts/skills" },
            { slug: "docs/concepts/sub-agents" },
            { slug: "docs/concepts/stacks" },
            { slug: "docs/concepts/install-modes" },
          ],
        },
        // Autogenerated groups are nested inside `items` rather than sitting
        // beside `label`. Starlight removed the flat `{ label, autogenerate }`
        // form in v0.39.0.
        {
          label: "Guides",
          items: [{ autogenerate: { directory: "docs/guides" } }],
        },
        {
          label: "Reference",
          items: [{ autogenerate: { directory: "docs/reference" } }],
        },
        {
          label: "Resources",
          items: [
            // The page first, then the three links it describes. It was built
            // and indexed but linked from nowhere — not this sidebar, not the
            // docs hub, not any prose — so the only way to reach it was search.
            // It is not redundant with the links below it: it says what the
            // marketplace is, what to go there for, how to install a skill
            // without the CLI, and how the changelog is laid out.
            { slug: "docs/resources" },
            {
              label: "Skills repository",
              link: SKILLS_REPO_URL,
              attrs: { target: "_blank", rel: "noopener noreferrer" },
            },
            {
              label: "GitHub repository",
              link: GITHUB_REPO_URL,
              attrs: { target: "_blank", rel: "noopener noreferrer" },
            },
            {
              label: "Changelog",
              link: CHANGELOG_URL,
              attrs: { target: "_blank", rel: "noopener noreferrer" },
            },
          ],
        },
      ],
    }),
  ],
})
