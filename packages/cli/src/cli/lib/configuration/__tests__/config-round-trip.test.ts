import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TEST_SOURCE_URL } from "../../__tests__/test-constants.js";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { generateConfigSource } from "../config-writer";
import { loadConfig } from "../config-loader";
import { loadProjectConfig } from "../project-config";
import { createTempDir, cleanupTempDir } from "../../__tests__/test-fs-utils";
import { buildSkillConfigs } from "../../__tests__/helpers/wizard-simulation.js";
import {
  buildProjectConfig,
  buildAgentConfigs,
} from "../../__tests__/factories/config-factories.js";
import { expectAgentConfigs, expectSkillConfigs } from "../../__tests__/assertions/index.js";
import type { ProjectConfig } from "../../../types";
import { CLAUDE_SRC_DIR, STANDARD_FILES } from "../../../consts";
import { EXPECTED_SKILLS } from "../../__tests__/expected-values";

let tempDir: string;

beforeEach(async () => {
  tempDir = await createTempDir("config-roundtrip-");
});

afterEach(async () => {
  await cleanupTempDir(tempDir);
});

/**
 * Strips the type-only import, type annotations, and `satisfies` — none is needed at runtime,
 * and jiti cannot resolve the config-types path in a bare temp dir.
 */
function stripTypeOnlySyntax(source: string): string {
  return source
    .replace(/import type \{[^}]+\} from "\.\/config-types";\n/, "")
    .replace(/ satisfies ProjectConfig/, "")
    .replace(/const (\w+): [^=]+=/g, "const $1 =");
}

/**
 * Helper: write generated config source and load it back via jiti.
 */
async function writeAndLoad(config: ProjectConfig): Promise<unknown> {
  const configPath = path.join(tempDir, STANDARD_FILES.CONFIG_TS);
  await writeFile(configPath, stripTypeOnlySyntax(generateConfigSource(config)));

  return loadConfig(configPath);
}

/**
 * Helper: write generated config source where a project keeps it and load it through the project
 * loader, so the stack normalizer runs. `writeAndLoad` above deliberately skips that — it pins
 * the literal emitted shape; this one pins what consumers actually receive.
 */
async function writeAndLoadProjectConfig(config: ProjectConfig): Promise<ProjectConfig> {
  const claudeSrcDir = path.join(tempDir, CLAUDE_SRC_DIR);
  await mkdir(claudeSrcDir, { recursive: true });
  await writeFile(
    path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TS),
    stripTypeOnlySyntax(generateConfigSource(config)),
  );

  const loaded = await loadProjectConfig(tempDir);
  if (!loaded) throw new Error("the generated config.ts must be loadable");
  return loaded.config;
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

    // web-framework is exclusive, so the array wrapper goes too — the bare string IS the entry
    const webDev = loaded.stack?.["web-developer"] as Record<string, unknown>;
    expect(webDev["web-framework"]).toStrictEqual("web-framework-react");
  });

  it("normalizes a bare exclusive-category entry back to SkillAssignment[] on load", async () => {
    const config = buildProjectConfig({
      name: "bare-entry-project",
      agents: buildAgentConfigs(["web-developer"]),
      skills: buildSkillConfigs(["web-framework-react"]),
      stack: {
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      },
    });

    // The file on disk carries the bare form...
    expect(generateConfigSource(config)).toMatch(/"web-framework":\s*"web-framework-react"/);

    // ...and every consumer downstream of the loader still sees SkillAssignment[].
    const loaded = await writeAndLoadProjectConfig(config);
    expect(loaded.stack?.["web-developer"]).toStrictEqual({
      "web-framework": [{ id: "web-framework-react", preloaded: false }],
    });
  });

  it("round-trips a stack whose assignments carry no flags", async () => {
    const config = buildProjectConfig({
      name: "flagless-assignment-project",
      agents: buildAgentConfigs(["web-developer"]),
      skills: buildSkillConfigs(["web-framework-react"]),
      stack: {
        "web-developer": {
          "web-framework": [{ id: "web-framework-react" }],
        },
      },
    });

    // The file on disk carries the bare form...
    expect(generateConfigSource(config)).toMatch(/"web-framework":\s*"web-framework-react"/);

    // ...and the loader hands every consumer back a normalized SkillAssignment[].
    const loaded = await writeAndLoadProjectConfig(config);
    expect(loaded.stack?.["web-developer"]).toStrictEqual({
      "web-framework": [{ id: "web-framework-react", preloaded: false }],
    });
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
    // Preloaded stays an object; api-api is exclusive, so it stands alone rather than in an array
    expect(apiDev["api-api"]).toStrictEqual({ id: "api-framework-hono", preloaded: true });
  });

  it("round-trips a full config with all optional fields", async () => {
    const config = buildProjectConfig({
      name: "full-project",
      description: "A complete project configuration",
      agents: buildAgentConfigs(["web-developer", "api-developer"]),
      skills: buildSkillConfigs([...EXPECTED_SKILLS.WEB_AND_API]),
      author: "@vince",
      selectedDomains: ["web", "api"],
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
    });

    const loaded = (await writeAndLoad(config)) as Record<string, unknown>;
    expect(loaded).toStrictEqual({ name: "sparse-project", agents: [], skills: [] });
    expect("description" in loaded).toBe(false);
    expect("author" in loaded).toBe(false);
    expect("stack" in loaded).toBe(false);
  });
});
