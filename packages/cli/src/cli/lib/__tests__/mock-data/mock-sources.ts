import { createMockSkillSource } from "../factories/skill-factories.js";

export const PUBLIC_SOURCE = createMockSkillSource("public");

export const ACME_SOURCE = createMockSkillSource("private", {
  name: "acme-corp",
  url: "github:acme-corp/skills",
});

export const INTERNAL_SOURCE = createMockSkillSource("private", {
  name: "internal",
  url: "github:internal/skills",
});
