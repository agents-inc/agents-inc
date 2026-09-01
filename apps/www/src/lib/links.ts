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
 * Where the editor lives: `/editor` on this same hostname, served by the
 * `agents-inc-editor` Worker behind the Cloudflare Route `agentsinc.sh/editor*`
 * while this build holds the apex as a Custom Domain. That is the one-hostname
 * split decided on 2026-08-03 and landed under WWW-03 ("Domains and the app
 * split") in todo/www.md, which carries the old identifier: item 10 of
 * docs/web/editor-todo.md.
 *
 * RELATIVE, AND SO NOT VERIFIABLE LOCALLY. It crosses a Worker boundary that
 * only production has: `astro dev` and `astro preview` serve this build alone,
 * so these links 404 in every local modality of this workspace and are correct
 * only at the edge. Check them against the real hostname, not a preview.
 */
export const EDITOR_URL = "/editor"

/**
 * The attributes every off-site link on this site carries. Named because the
 * `rel` half is a security property rather than a preference, and one link
 * that quietly forgets it is not something review reliably catches.
 */
export const EXTERNAL_LINK_ATTRS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const
