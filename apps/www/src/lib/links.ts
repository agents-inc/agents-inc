import type { HTMLAttributes } from "astro/types"

// Plain constants, so astro.config.ts can read them at config-load time.

export const GITHUB_REPO_URL = "https://github.com/agents-inc/agents-inc"

export const SKILLS_REPO_URL = "https://github.com/agents-inc/skills"

export const DOCS_PATH = "/docs"

// Served by the editor's Worker on the same hostname, so it 404s locally.
export const EDITOR_URL = "/editor"

// `rel` is a security property, not a preference. Only a fresh object literal
// is checked for unknown keys, so `satisfies` is what refuses a misspelt one.
export const EXTERNAL_LINK_ATTRS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const satisfies HTMLAttributes<"a">
