import { parse as parseYaml } from "yaml";

export { CLI_ROOT, runCliCommand } from "./cli-runner.js";
export {
  readTestYaml,
  readTestJson,
  readTestTsConfig,
  writeTestTsConfig,
  writeTestPackageJson,
} from "./config-io.js";
// Exported as a pair: offering only the order-insensitive one invites the wrong swap.
export { normalizeGlobalConfig, normalizeConfigPreservingOrder } from "./config-comparison.js";
export {
  writeTestSkill,
  writeSourceSkill,
  writeTestAgent,
  writeSourceAgent,
  writeTestPluginManifest,
} from "./disk-writers.js";
export { buildSkillConfig, buildSkillConfigs } from "./skill-config-builders.js";
export { createTestDirs, cleanupTestDirs } from "./test-dir-setup.js";
export type { PluginTestDirs } from "./test-dir-setup.js";
export { setupIsolatedHome, useFakeHome } from "./isolated-home.js";
export type { IsolatedHome } from "./isolated-home.js";
export { silenceConsole } from "./silence-console.js";
export { createMockPluginHost } from "./mock-plugin-host.js";
export { elementAt, firstElement } from "./element-at.js";
export { installThroughOperations } from "./install-through-operations.js";
export type {
  InstallThroughOperationsOptions,
  InstallThroughOperationsResult,
} from "./install-through-operations.js";

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
