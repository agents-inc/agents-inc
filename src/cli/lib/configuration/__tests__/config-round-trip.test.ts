import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TEST_SOURCE_URL } from "../../__tests__/test-constants.js";
import path from "path";
import { writeFile } from "fs/promises";
import { generateConfigSource } from "../config-writer";
import { loadConfig } from "../config-loader";
import { createTempDir, cleanupTempDir } from "../../__tests__/test-fs-utils";
import { buildSkillConfigs } from "../../__tests__/helpers/wizard-simulation.js";
import {
  buildProjectConfig,
  buildAgentConfigs,
} from "../../__tests__/factories/config-factories.js";
import { expectAgentConfigs, expectSkillConfigs } from "../../__tests__/assertions/index.js";
import type { ProjectConfig } from "../../../types";
import { STANDARD_FILES } from "../../../consts";
import { EXPECTED_SKILLS } from "../../__tests__/expected-values";

let tempDir: string;

beforeEach(async () => {
  tempDir = await createTempDir("config-roundtrip-");
});

afterEach(async () => {
  await cleanupTempDir(tempDir);
});

/**
 * Helper: write generated config source and load it back via jiti.
 * Strips the type-only import, type annotations, and `satisfies` (not needed at runtime).
 */
async function writeAndLoad(config: ProjectConfig): Promise<unknown> {
  let source = generateConfigSource(config);
  // Remove type-only import and satisfies (not needed at runtime, jiti may not resolve the path)
  source = source.replace(/import type \{[^}]+\} from "\.\/config-types";\n/, "");
  source = source.replace(/ satisfies ProjectConfig/, "");
  // Strip type annotations from const declarations
  source = source.replace(/const (\w+): [^=]+=/g, "const $1 =");

  const configPath = path.join(tempDir, STANDARD_FILES.CONFIG_TS);
  await writeFile(configPath, source);

  return loadConfig(configPath);
}

/**
 * Normalize config for comparison: the writer compacts stack values
 * (bare strings for non-preloaded single skills). After round-trip,
 * bare strings come back as strings (not SkillAssignment objects).
 * We normalize the original to match.
 */
function normalizeForComparison(config: ProjectConfig): Record<string, unknown> {
  // Remove undefined values (same as JSON.parse(JSON.stringify(x)))
  return JSON.parse(JSON.stringify(config));
}

describe("config round-trip", () => {
  it("round-trips a minimal config", async () => {
    const config = buildProjectConfig({ name: "minimal-project" });

    const loaded = await writeAndLoad(config);
    expect(loaded).toStrictEqual(normalizeForComparison(config));
  });

  it("round-trips a config with stack (non-preloaded)", async () => {
    const config = buildProjectConfig({
      name: "stack-project",
      agents: buildAgentConfigs(["web-developer", "api-developer"]),
      skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
      stack: {
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
        "api-developer": {
          "api-api": [{ id: "api-framework-hono", preloaded: false }],
        },
      },
    });

    const loaded = (await writeAndLoad(config)) as ProjectConfig;
    // Stack gets compacted: non-preloaded single skills become bare strings
    expect(loaded.name).toBe("stack-project");
    expectAgentConfigs(loaded, buildAgentConfigs(["web-developer", "api-developer"]));
    expectSkillConfigs(loaded, buildSkillConfigs(["web-framework-react", "api-framework-hono"]));

    // After compaction, bare strings inside arrays
    const webDev = loaded.stack?.["web-developer"] as Record<string, unknown>;
    expect(webDev["web-framework"]).toStrictEqual(["web-framework-react"]);
  });

  it("round-trips a config with preloaded stack skills", async () => {
    const config = buildProjectConfig({
      name: "preloaded-project",
      agents: buildAgentConfigs(["api-developer"]),
      skills: buildSkillConfigs([...EXPECTED_SKILLS.API_DEFAULT]),
      stack: {
        "api-developer": {
          "api-api": [{ id: "api-framework-hono", preloaded: true }],
        },
      },
    });

    const loaded = (await writeAndLoad(config)) as ProjectConfig;
    const apiDev = loaded.stack?.["api-developer"] as Record<string, unknown>;
    // Preloaded stays as object inside array
    expect(apiDev["api-api"]).toStrictEqual([{ id: "api-framework-hono", preloaded: true }]);
  });

  it("round-trips a full config with all optional fields", async () => {
    const config = buildProjectConfig({
      name: "full-project",
      description: "A complete project configuration",
      agents: buildAgentConfigs(["web-developer", "api-developer"]),
      skills: buildSkillConfigs([...EXPECTED_SKILLS.WEB_AND_API]),
      author: "@vince",
      domains: ["web", "api"],
      selectedAgents: ["web-developer", "api-developer"],
      source: TEST_SOURCE_URL,
      marketplace: "agents-inc",
    });

    const loaded = await writeAndLoad(config);
    expect(loaded).toStrictEqual(normalizeForComparison(config));
  });

  it("round-trips a config with multiple skills per category", async () => {
    const config = buildProjectConfig({
      name: "multi-skill-project",
      skills: buildSkillConfigs(["web-testing-vitest", "web-testing-playwright-e2e"]),
      stack: {
        "web-developer": {
          "web-testing": [
            { id: "web-testing-vitest", preloaded: false },
            { id: "web-testing-playwright-e2e", preloaded: true },
          ],
        },
      },
    });

    const loaded = (await writeAndLoad(config)) as ProjectConfig;
    const webDev = loaded.stack?.["web-developer"] as Record<string, unknown>;
    // Multiple skills: array with compacted elements
    expect(webDev["web-testing"]).toStrictEqual([
      "web-testing-vitest",
      { id: "web-testing-playwright-e2e", preloaded: true },
    ]);
  });

  it("omits undefined fields in round-trip", async () => {
    const config = buildProjectConfig({
      name: "sparse-project",
      agents: [],
      skills: [],
      description: undefined,
      author: undefined,
      stack: undefined,
    });

    const loaded = (await writeAndLoad(config)) as Record<string, unknown>;
    expect(loaded).toStrictEqual({ name: "sparse-project", agents: [], skills: [] });
    expect("description" in loaded).toBe(false);
    expect("author" in loaded).toBe(false);
    expect("stack" in loaded).toBe(false);
  });
});
