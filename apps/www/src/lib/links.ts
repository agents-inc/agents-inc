// Plain constants, so astro.config.ts can read them at config-load time.

export const GITHUB_REPO_URL = "https://github.com/agents-inc/agents-inc"

export const SKILLS_REPO_URL = "https://github.com/agents-inc/skills"

export const CHANGELOG_URL = `${GITHUB_REPO_URL}/releases`

export const DOCS_PATH = "/docs"

export const HOME_PATH = "/"

// Served by the editor's Worker on the same hostname, so it 404s locally.
export const EDITOR_URL = "/editor"

// `rel` is a security property, not a preference.
export const EXTERNAL_LINK_ATTRS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const
