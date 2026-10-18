import type { SeedExternalSkill, SeedSkillTree } from "@workspace/matrix"

import type { CarriedSkillInstall } from "../../carried-skill"

/** `files` has no default: every spec here asserts on what the directory held. */
export function buildExternalSkill(
  fields: Pick<SeedExternalSkill, "files"> & Partial<SeedExternalSkill>
): SeedExternalSkill {
  return {
    displayName: "Word documents",
    description: "Reads and writes Word documents",
    categoryId: "shared-tooling",
    repo: "acme/skills",
    path: "skills/docx",
    ...fields,
  }
}

export function buildCarriedSkillInstall(
  skill: SeedExternalSkill,
  fields: Partial<Omit<CarriedSkillInstall, "skill">> = {}
): CarriedSkillInstall {
  return {
    id: "acme-docx",
    domain: "shared",
    usageGuidance: "Use when the task touches a Word document.",
    date: "2026-10-17",
    skill,
    ...fields,
  }
}

export function buildSkillTree(
  manifest: string,
  others: Readonly<Record<string, string>> = {}
): SeedSkillTree {
  return { "SKILL.md": manifest, ...others }
}
