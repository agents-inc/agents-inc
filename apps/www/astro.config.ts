import starlight from "@astrojs/starlight"
import type { StarlightExpressiveCodeOptions } from "@astrojs/starlight/expressive-code"
import tailwindcss from "@tailwindcss/vite"
import { inkRampSyntaxTheme } from "@workspace/ui/lib/syntax-theme"
import { defineConfig } from "astro/config"

// The same three destinations the header, the footer and the 404 page use.
// They were declared here and again in index.astro until 2026-08-21.
import {
  CHANGELOG_URL,
  EXTERNAL_LINK_ATTRS,
  GITHUB_REPO_URL,
  SKILLS_REPO_URL,
} from "./src/lib/links"

/**
 * CODE BLOCKS, drawn as the design draws a command rather than as a picture of
 * somebody else's terminal.
 *
 * Expressive Code — which Starlight bundles — detects that a block is shell and
 * wraps it in a macOS terminal window: a title bar with three round dots at the
 * left. The dots are painted through `mask-image`, and a mask has no geometry
 * for `border-radius` to act on, so the one unlayered radius reset in
 * site.css — the rule that flattens all seventeen of Starlight's own corners —
 * could not reach them. They were the only round things left on the site, and
 * they survived precisely because they are not shapes.
 *
 * `frame: "none"` removes the chrome rather than restyling it, which lands
 * somewhere better than neutral: what is left is a bordered box of mono text on
 * the `code` surface, and that is exactly what packages/ui's CommandBlock is
 * and what the landing page's hero already renders. `npx agents-inc init` is
 * now drawn the same way on both halves of the site.
 */
const CODE_BLOCK_DEFAULTS = { frame: "none" } as const

/**
 * SYNTAX COLOUR, from @workspace/ui rather than from a theme that ships with
 * the tool.
 *
 * The theme itself — its palette, its scope groups, and why it ranks code by
 * lightness rather than by hue — lives in packages/ui/src/lib/syntax-theme.ts,
 * beside the globals.css tokens whose five hexes it mirrors. It was declared
 * here while this site was its only consumer, and stopped being one when the
 * editor's output preview needed the same colours: a second copy of a palette
 * is a second syntax identity, drifting from the first. So nothing about the
 * theme may come back into this file, and scripts/check-syntax-theme.ts reads
 * both this config and the built HTML to hold that.
 *
 * WHAT IS THIS SITE'S OWN, AND STAYS: the pair. Two themes are required
 * whenever `themes` is set, and Starlight will not accept one. Both entries are
 * the same light theme, because the site ships a single light theme by decision
 * (see src/components/theme-provider.astro) — so the dark slot must not be
 * allowed to resolve to Night Owl Dark on the no-JS path, where Starlight's own
 * Page.astro hardcodes `data-theme="dark"`.
 *
 * The shape is Starlight's own, taken from the option the pair is handed to
 * rather than restated. The shared factory declares its return structurally and
 * imports nothing, precisely so each consumer satisfies its own toolchain's
 * type at the call site; the annotation below is this site doing that.
 *
 * ONE THING TO KNOW BEFORE CHANGING ANY OF THIS: Expressive Code caches its
 * rendered output, and a stale cache survives an ordinary rebuild. If an edit
 * appears to do nothing, `rm -rf dist .astro node_modules/.astro` before
 * concluding it did not work.
 */
type SyntaxTheme = NonNullable<StarlightExpressiveCodeOptions["themes"]>[number]

const SYNTAX_THEMES: SyntaxTheme[] = [
  inkRampSyntaxTheme("agents-inc-dark", "dark"),
  inkRampSyntaxTheme("agents-inc", "light"),
]

/**
 * One build serves two things: the marketing landing page at `/`, from
 * `src/pages/`, and the Starlight documentation at `/docs`, from the `docs`
 * content collection.
 *
 * NO REACT INTEGRATION, DELIBERATELY. Please do not "fix" this by adding
 * `@astrojs/react`.
 *
 * The only thing this site needs from the design system is its *tokens*,
 * which are plain CSS custom properties in `@workspace/ui`'s globals.css.
 * No React is required to consume them. The landing page is `.astro` plus
 * Tailwind; the docs are Starlight's own components. (When this was written
 * the repository also ran two React majors side by side, which made staying
 * React-free a real escape from that split; the versions were unified on
 * 2026-08-05, so what remains is the plain point that nothing here needs
 * React.)
 *
 * If a genuinely interactive island is needed later, this is one integration
 * and one dependency away.
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

      /**
       * `puzzle`, not `seti:plan`. The `seti:*` set is Starlight's FILE-TYPE
       * icon family — the glyphs its `<FileTree>` component puts beside a
       * filename — and `plan` in it is the icon for a `.plan` file. It meant
       * nothing next to a link to the skills repository, and it is the only
       * icon on the site that a reader could not have guessed.
       *
       * A puzzle piece is not decoration either: a skill IS an atomic piece
       * that composes into a sub-agent, and that is the product's own
       * metaphor rather than one borrowed for the icon.
       */
      social: [
        { icon: "github", label: "GitHub", href: GITHUB_REPO_URL },
        { icon: "puzzle", label: "Skills", href: SKILLS_REPO_URL },
      ],

      expressiveCode: {
        defaultProps: CODE_BLOCK_DEFAULTS,
        themes: SYNTAX_THEMES,

        /**
         * The block's own chrome — its surface, its border, its scrollbar —
         * follows the `--sl-color-*` mapping in site.css rather than the two
         * themes above, so a code block is bordered with the same hairline
         * token as everything else on the page and there is one place to
         * change it. Expressive Code turns this off by default the moment
         * `themes` is set; the check it is guarding against is that both a
         * light and a dark theme exist, and both do.
         */
        useStarlightUiThemeColors: true,

        /**
         * No dark-mode switch to wire up: the site ships one theme, light, by
         * decision. Left on, this would emit a second copy of every syntax
         * colour behind a `[data-theme='dark']` selector that nothing here
         * ever satisfies — and Starlight's own Page.astro hardcodes exactly
         * that attribute on the no-JS path, which is where it would have shown.
         */
        useStarlightDarkModeSwitch: false,

        /**
         * OFF, DELIBERATELY, AND THIS IS THE OWNER'S RULING RATHER THAN A
         * PREFERENCE. Expressive Code lightens or darkens any syntax colour
         * that falls below this contrast ratio against the code background,
         * and it defaults to 5.5 — which silently rewrote this palette's
         * `--color-brand-ink` (#a06a1c) to #8a5b18 in the built HTML.
         *
         * todo/www.md records under "Constraints already settled" that WCAG AA
         * contrast is deliberately not met on this site and stays that way
         * (owner ruling, 2026-08-07), and that the palette is not to be
         * "fixed" for contrast. A tool quietly doing it on the way out is the
         * same edit with nobody's name on it, so it is switched off and the
         * colours ship as the design system declares them.
         */
        minSyntaxHighlightingColorContrast: 0,
      },

      customCss: ["./src/styles/site.css"],

      /**
       * A single, light theme. See src/styles/site.css for the colour mapping
       * and src/components/theme-provider.astro for why the toggle is gone.
       */
      components: {
        ThemeProvider: "./src/components/theme-provider.astro",
        ThemeSelect: "./src/components/theme-select.astro",

        /**
         * Starlight's `<head>`, with the webfont preloads in front of it. The
         * `head:` array below would be the smaller change and cannot work: its
         * URLs are written before Vite has content-hashed anything, and a
         * preload naming a file that is not served fails silently. See
         * src/components/head.astro.
         */
        Head: "./src/components/head.astro",
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
            // Between the two on purpose: "should I" is answered above it and
            // "walk me through one" below it, and the question in the middle —
            // which of the four intakes suits what I am holding — had no page
            // at all until 2026-08-31. Two of the four were undocumented
            // entirely; the composer had one subordinate clause on the editor
            // page and stack detection was not named anywhere on this site.
            { slug: "docs/ways-in" },
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
            // Install mode and scope are the two independent per-skill choices
            // and sit as a pair. They were one page until 2026-08-27; the title
            // said "Install modes" while half the body was scope, so a reader
            // looking for project-versus-global could not find it by name.
            { slug: "docs/concepts/install-modes" },
            { slug: "docs/concepts/scopes" },
          ],
        },
        // Autogenerated groups are nested inside `items` rather than sitting
        // beside `label`. Starlight removed the flat `{ label, autogenerate }`
        // form in v0.39.0.
        {
          label: "Guides",
          items: [{ autogenerate: { directory: "docs/guides" } }],
        },

        // The four groups below join the three above them in ascending
        // commitment: a reader arrives at Guides with a task, at Configuration
        // once the wizard's choices stop being enough, at The editor if they
        // would rather see the catalogue than type at it, and at Recipes and
        // Troubleshooting with something specific already in mind.
        //
        // `autogenerate` rather than a hand-listed `items` for all four, so a
        // page added to one of these directories joins the sidebar by existing.
        // The five hand-listed groups above predate the convention and are left
        // alone; the cost of the automatic form is that ordering is delegated
        // to each page's own `sidebar: order:` frontmatter, which every page in
        // these four directories carries.
        {
          label: "Configuration",
          items: [{ autogenerate: { directory: "docs/configuration" } }],
        },
        {
          label: "The editor",
          items: [{ autogenerate: { directory: "docs/editor" } }],
        },
        {
          label: "Recipes",
          items: [{ autogenerate: { directory: "docs/recipes" } }],
        },
        {
          label: "Troubleshooting",
          items: [{ autogenerate: { directory: "docs/troubleshooting" } }],
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
              attrs: EXTERNAL_LINK_ATTRS,
            },
            {
              label: "GitHub repository",
              link: GITHUB_REPO_URL,
              attrs: EXTERNAL_LINK_ATTRS,
            },
            {
              label: "Changelog",
              link: CHANGELOG_URL,
              attrs: EXTERNAL_LINK_ATTRS,
            },
          ],
        },
      ],
    }),
  ],
})
