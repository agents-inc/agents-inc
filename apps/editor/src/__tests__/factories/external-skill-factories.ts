import { externalSkillId, type ExternalSkill } from "@/stores/catalog-store"

import type { SeedExternalSkill } from "@workspace/matrix"

// `web-styling` takes several, so picking this skill evicts no sibling.
const HOUSE_CATEGORY = "web-styling"

/** The id an added third-party skill is filed under. */
export const HOUSE_SKILL_ID = externalSkillId(HOUSE_CATEGORY, "House Styles")

/** A skill added from a third-party repository, as a payload carries it. */
const carriedHouseSkill = (
  overrides: Partial<SeedExternalSkill> = {}
): SeedExternalSkill => ({
  displayName: "House Styles",
  description: "The house styling conventions.",
  categoryId: HOUSE_CATEGORY,
  repo: "acme/skills",
  path: "skills/house-styles",
  files: { "SKILL.md": "---\nname: house-styles\n---\n\n# House Styles\n" },
  ...overrides,
})

/** That skill as the catalogue seats it, under its installed id. */
export const houseSkill = (
  overrides: Partial<ExternalSkill> = {}
): ExternalSkill => ({
  id: HOUSE_SKILL_ID,
  ...carriedHouseSkill(),
  ...overrides,
})
