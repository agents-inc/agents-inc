import { CATALOG, DOMAIN_ORDER, SUB_AGENTS_BY_ID } from "@workspace/matrix"

// Counted at build time so the site's prose cannot drift from the catalogue.

/** Skills in categories the UI can place. */
export const SKILL_COUNT = CATALOG.skillCount

export const AGENT_COUNT = Object.keys(SUB_AGENTS_BY_ID).length

// Ids rather than labels: an id is what a reader types in metadata.yaml.
export const DOMAIN_COUNT = DOMAIN_ORDER.length

export const DOMAIN_IDS = DOMAIN_ORDER.join(", ")
