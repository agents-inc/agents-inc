import { CATALOG, SUB_AGENTS_BY_ID } from "@workspace/matrix"

/**
 * The two catalogue numbers this site quotes, counted rather than typed.
 *
 * Both were hand-written literals in five places — the landing page's eyebrow
 * and four prose sentences — and all five were wrong the day after the
 * catalogue moved 222 → 228 skills and 23 → 25 sub-agents. `@workspace/matrix`
 * is the same catalogue package the editor reads, and this site renders
 * statically, so counting at build time costs one array length and ships no
 * JavaScript to anybody.
 *
 * The pages that import these are `.mdx` rather than `.md` for that reason
 * alone. Starlight adds `@astrojs/mdx` itself when it is not already
 * configured, and a slug is the file path without its extension, so nothing in
 * astro.config.ts changed with them.
 */

/**
 * Every skill in a category the UI can place. The catalogue's own `SKILL_IDS`
 * agrees with it today; this one is preferred because it counts what a reader
 * is actually offered rather than what the generator emitted.
 */
export const SKILL_COUNT = CATALOG.skillCount

/** Every sub-agent the catalogue defines, across all nine domains. */
export const AGENT_COUNT = Object.keys(SUB_AGENTS_BY_ID).length
