/**
 * The handful of destinations this site names more than once.
 *
 * They were declared three times before this file existed — once in
 * astro.config.ts for the sidebar and the social icons, once in index.astro
 * for the header and the footer, and about to be a third time in 404.astro,
 * which is what made it worth stopping. Two of them are repository URLs that
 * change if the organisation is ever renamed, and a set of nav links that
 * disagree about where "Skills" points is exactly the kind of drift the
 * two-halves-one-product work exists to remove.
 *
 * Plain constants with no Astro or Starlight imports, so astro.config.ts can
 * read them at config-load time as easily as a page can at render time.
 */

export const GITHUB_REPO_URL = "https://github.com/agents-inc/agents-inc"

export const SKILLS_REPO_URL = "https://github.com/agents-inc/skills"

export const CHANGELOG_URL = `${GITHUB_REPO_URL}/releases`

export const DOCS_PATH = "/docs"

export const HOME_PATH = "/"

/**
 * Where the editor lives TODAY: the apex, on its own. The one-hostname split
 * decided on 2026-08-03 — `/` the landing page, `/docs` Starlight, `/editor`
 * today's apps/editor — is a separate piece of work that is not live, and it
 * is WWW-03 ("Domains and the app split") in todo/www.md, which carries the
 * old identifier: item 10 of docs/web/editor-todo.md.
 *
 * WHEN THAT SPLIT LANDS: change this to "/editor". Until then it has to be
 * the absolute URL, because a shipped page cannot carry a link that 404s and
 * `/editor` is exactly that — this build serves nothing there.
 */
export const EDITOR_URL = "https://agentsinc.sh"

/**
 * The attributes every off-site link on this site carries. Named because the
 * `rel` half is a security property rather than a preference, and one link
 * that quietly forgets it is not something review reliably catches.
 */
export const EXTERNAL_LINK_ATTRS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const
