import { CATALOG, DOMAIN_ORDER, SUB_AGENTS_BY_ID } from "@workspace/matrix"

/**
 * The catalogue facts this site quotes, counted rather than typed.
 *
 * The counts were hand-written literals in five places — the landing page's
 * eyebrow and four prose sentences — and all five were wrong the day after the
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

/** Every sub-agent the catalogue defines. */
export const AGENT_COUNT = Object.keys(SUB_AGENTS_BY_ID).length

/**
 * The domains, as a count and as the list itself.
 *
 * Both are here for the same reason the counts above are: two pages named
 * seven of them in prose — `desktop` and `cli` were missing from both — and
 * stayed wrong for a fortnight, because adding a domain is a one-line edit in
 * a generated union that no documentation pass is looking at. A count and a
 * list are the same claim at two resolutions, so a page quoting one without
 * the other can still be read as complete while being short by two.
 *
 * The ids rather than `DOMAIN_LABELS`, because a domain id is what a reader
 * types: it is the literal `domain:` value in a skill's `metadata.yaml`. The
 * labels exist to fit nine chips on the editor's filter bar, which is not a
 * problem prose has.
 *
 * `DOMAIN_ORDER` rather than `DOMAINS`, because the generated union is
 * alphabetical and this is the order every other surface presents them in.
 */
export const DOMAIN_COUNT = DOMAIN_ORDER.length

export const DOMAIN_IDS = DOMAIN_ORDER.join(", ")
