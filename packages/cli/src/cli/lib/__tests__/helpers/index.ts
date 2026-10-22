import { parse as parseYaml } from "yaml";

export { buildSkillConfig, buildSkillConfigs } from "./skill-config-builders.js";

/** Raw frontmatter key-values, without the production parser's Zod validation. */
export function parseTestFrontmatter(content: string): Record<string, unknown> | null {
  if (!content.startsWith("---")) {
    return null;
  }

  const endIndex = content.indexOf("---", 3);
  if (endIndex === -1) {
    return null;
  }

  const yamlContent = content.slice(3, endIndex).trim();
  try {
    // Boundary cast: YAML parse returns `unknown`
    return parseYaml(yamlContent) as Record<string, unknown>;
  } catch {
    return null;
  }
}
