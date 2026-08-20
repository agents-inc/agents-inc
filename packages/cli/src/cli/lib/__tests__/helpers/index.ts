import { parse as parseYaml } from "yaml";

// --- Re-exports from sub-files ---
export { CLI_ROOT, runCliCommand } from "./cli-runner.js";
export {
  readTestYaml,
  readTestJson,
  readTestTsConfig,
  writeTestTsConfig,
  writeTestPackageJson,
} from "./config-io.js";
// Both, never one. The two normalisers are a single substitution apart and the weaker one
// leaves a reordering assertion green, so a door offering only `normalizeGlobalConfig` steers
// an author who meant the order-sensitive comparison into exactly the swap
// `config-comparison.js` documents. Neither is imported through this barrel today, which is
// what makes carrying one of the pair a trap rather than a preference.
export { normalizeGlobalConfig, normalizeConfigPreservingOrder } from "./config-comparison.js";
export {
  writeTestSkill,
  writeSourceSkill,
  writeTestAgent,
  writeSourceAgent,
  writeTestPluginManifest,
} from "./disk-writers.js";
export {
  buildSkillConfig,
  buildSkillConfigs,
  simulateSkillSelections,
  buildWizardResultFromStore,
  extractSkillIdsFromAssignment,
} from "./wizard-simulation.js";
export { createTestDirs, cleanupTestDirs } from "./test-dir-setup.js";
export type { PluginTestDirs } from "./test-dir-setup.js";
export { setupIsolatedHome, useFakeHome } from "./isolated-home.js";
export type { IsolatedHome } from "./isolated-home.js";
export { silenceConsole } from "./silence-console.js";
export { elementAt, firstElement } from "./element-at.js";

// --- Remaining utility function ---

/**
 * Lightweight frontmatter parser for test assertions.
 * Returns raw key-value pairs (unlike the production parseFrontmatter which
 * returns typed SkillFrontmatter with Zod validation).
 */
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
