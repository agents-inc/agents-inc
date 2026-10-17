import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TEST_SOURCE_URL } from "../../__tests__/test-constants.js";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { generateConfigSource } from "../config-writer";
import { loadConfig } from "../config-loader";
import { matrix } from "../../matrix/matrix-provider";
import { loadProjectConfig } from "../project-config";
import { createTempDir, cleanupTempDir } from "../../__tests__/test-fs-utils";
import {
  buildSkillConfig,
  buildSkillConfigs,
} from "../../__tests__/helpers/skill-config-builders.js";
import {
  buildProjectConfig,
  buildAgentConfigs,
} from "../../__tests__/factories/config-factories.js";
import { sa, saUnflagged } from "../../__tests__/factories/skill-factories.js";
import { expectAgentConfigs, expectSkillConfigs } from "../../__tests__/assertions/index.js";
import { elementAt } from "../../__tests__/helpers/element-at.js";
import type { ProjectConfig, SkillConfig } from "../../../types";
import { DEFAULT_PUBLIC_SOURCE_NAME, STANDARD_FILES } from "../../../consts";
import { EXPECTED_SKILLS } from "../../__tests__/expected-values";
import { sourceDir } from "../../installation/install-layout.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await createTempDir("config-roundtrip-");
});

afterEach(async () => {
  await cleanupTempDir(tempDir);
});

/** jiti cannot resolve the config-types import in a bare temp dir. */
function stripTypeOnlySyntax(source: string): string {
  return source
    .replace(/import type \{[^}]+\} from "\.\/config-types";\n/, "")
    .replace(/ satisfies ProjectConfig/, "")
    .replace(/const (\w+): [^=]+=/g, "const $1 =");
}

async function writeAndLoad(config: ProjectConfig): Promise<unknown> {
  const configPath = path.join(tempDir, STANDARD_FILES.CONFIG_TS);
  await writeFile(configPath, stripTypeOnlySyntax(generateConfigSource(config, matrix)));

  return loadConfig(configPath);
}

/** Through the project loader, so the normalizer runs; `writeAndLoad` pins the emitted shape. */
async function writeAndLoadProjectConfig(config: ProjectConfig): Promise<ProjectConfig> {
  const claudeSourceDir = sourceDir(tempDir, "claude");
  await mkdir(claudeSourceDir, { recursive: true });
  await writeFile(
    path.join(claudeSourceDir, STANDARD_FILES.CONFIG_TS),
    stripTypeOnlySyntax(generateConfigSource(config, matrix)),
  );

  const loaded = await loadProjectConfig(tempDir);
  if (!loaded) throw new Error("the generated config.ts must be loadable");
  return loaded.config;
}

function normalizeForComparison(config: ProjectConfig): Record<string, unknown> {
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
          "web-framework": [sa("web-framework-react", false)],
        },
        "api-developer": {
          "api-api": [sa("api-framework-hono", false)],
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
          "web-framework": [sa("web-framework-react", false)],
        },
      },
    });

    // The file on disk carries the bare form...
    expect(generateConfigSource(config, matrix)).toMatch(
      /'web-framework':\s*'web-framework-react'/,
    );

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
          "web-framework": [saUnflagged("web-framework-react")],
        },
      },
    });

    // The file on disk carries the bare form...
    expect(generateConfigSource(config, matrix)).toMatch(
      /'web-framework':\s*'web-framework-react'/,
    );

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
          "api-api": [sa("api-framework-hono", true)],
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
      marketplace: TEST_SOURCE_URL,
      marketplaceName: "agents-inc",
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
          "web-testing": [sa("web-testing-vitest", false), sa("web-testing-playwright-e2e", true)],
        },
      },
    });

    const loaded = (await writeAndLoad(config)) as ProjectConfig;
    const webDev = loaded.stack?.["web-developer"] as Record<string, unknown>;
    expect(webDev["web-testing"]).toStrictEqual([
      "web-testing-vitest",
      { id: "web-testing-playwright-e2e", preloaded: true },
    ]);
  });

  /**
   * A loaded config re-emitted must be byte-identical, or every fan-out rewrites unchanged files.
   */
  it("re-emits a config it just loaded with the same bytes", async () => {
    const config = buildProjectConfig({
      name: "fixed-point-project",
      agents: buildAgentConfigs(["web-developer"]),
      skills: buildSkillConfigs(["web-framework-react", "web-styling-tailwind"]),
      marketplace: TEST_SOURCE_URL,
      author: "@vince",
      stack: {
        "web-developer": {
          "web-styling": [saUnflagged("web-styling-tailwind")],
          "web-framework": [saUnflagged("web-framework-react")],
        },
      },
    });
    const firstEmission = generateConfigSource(config, matrix);

    const loaded = await writeAndLoadProjectConfig(config);

    // Subject guard: the values survived, so the byte comparison is about order.
    expect(loaded.marketplace).toBe(TEST_SOURCE_URL);
    expect(loaded.author).toBe("@vince");
    expect(
      generateConfigSource(loaded, matrix),
      "writing back a config just read off disk must not move a single byte",
    ).toBe(firstEmission);
  });

  it("lands the marketplace ref, the marketplace name and each skill's origin on their own fields", async () => {
    const config = buildProjectConfig({
      name: "renamed-fields-project",
      skills: buildSkillConfigs(["web-framework-react"], { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
      marketplace: TEST_SOURCE_URL,
      marketplaceName: DEFAULT_PUBLIC_SOURCE_NAME,
    });

    const loaded = await writeAndLoadProjectConfig(config);

    expect(loaded.marketplace, "the ref the run was told to install from").toBe(TEST_SOURCE_URL);
    expect(loaded.marketplaceName, "the name the fetched manifest gave it").toBe(
      DEFAULT_PUBLIC_SOURCE_NAME,
    );
    expect(
      loaded.skills.map((skill) => skill.origin),
      "each skill's provenance, which is neither of the two above",
    ).toStrictEqual([DEFAULT_PUBLIC_SOURCE_NAME]);
  });

  it("re-emits a config carrying the renamed marketplace fields with the same bytes", async () => {
    const config = buildProjectConfig({
      name: "renamed-fixed-point-project",
      agents: buildAgentConfigs(["web-developer"]),
      skills: buildSkillConfigs(["web-framework-react"], { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
      marketplace: TEST_SOURCE_URL,
      marketplaceName: DEFAULT_PUBLIC_SOURCE_NAME,
      author: "@vince",
    });
    const firstEmission = generateConfigSource(config, matrix);

    const loaded = await writeAndLoadProjectConfig(config);

    // Subject guard: the renamed fields survived, so the byte comparison is about order.
    expect(loaded.marketplace).toBe(TEST_SOURCE_URL);
    expect(loaded.marketplaceName).toBe(DEFAULT_PUBLIC_SOURCE_NAME);
    expect(loaded.skills.map((skill) => skill.origin)).toStrictEqual([DEFAULT_PUBLIC_SOURCE_NAME]);
    expect(
      generateConfigSource(loaded, matrix),
      "writing back a config just read off disk must not move a single byte",
    ).toBe(firstEmission);
  });

  /** The tombstone is out of schema order by hand: the writer, not the producer, owns order. */
  it("re-emits a config whose skill tombstone arrives out of schema order with the same bytes", async () => {
    const skills: SkillConfig[] = [
      buildSkillConfig("web-styling-tailwind", { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
      {
        id: "web-styling-tailwind",
        scope: "global",
        excluded: true,
        origin: DEFAULT_PUBLIC_SOURCE_NAME,
      },
    ];

    // Subject guard: the producer's key order must disagree with the loader's.
    expect(
      Object.keys(elementAt(skills, 1)),
      "the tombstone must reach the writer with `excluded` ahead of `origin`",
    ).toStrictEqual(["id", "scope", "excluded", "origin"]);

    const config = buildProjectConfig({
      name: "tombstone-fixed-point-project",
      agents: buildAgentConfigs(["web-developer"]),
      skills,
    });
    const firstEmission = generateConfigSource(config, matrix);

    const loaded = await writeAndLoadProjectConfig(config);

    // Subject guard: the tombstone survived, so the comparison is about order.
    expect(loaded.skills).toStrictEqual(skills);
    expect(
      generateConfigSource(loaded, matrix),
      "writing back a config just read off disk must not move a single byte",
    ).toBe(firstEmission);
  });

  /** The agent arm: `model` and `effort` sit between `scope` and `excluded` in the schema. */
  it("re-emits a config whose agent tombstone carries model and effort with the same bytes", async () => {
    const agents = [
      ...buildAgentConfigs(["web-developer"], { scope: "project", model: "opus", effort: "high" }),
      ...buildAgentConfigs(["web-developer"], {
        scope: "global",
        excluded: true,
        model: "opus",
        effort: "high",
      }),
    ];

    // Subject guard: the producer's key order must disagree with the loader's.
    expect(
      Object.keys(elementAt(agents, 1)),
      "the tombstone must reach the writer with `excluded` ahead of the two overrides",
    ).toStrictEqual(["name", "scope", "excluded", "model", "effort"]);

    const config = buildProjectConfig({
      name: "agent-override-fixed-point-project",
      agents,
      skills: buildSkillConfigs(["web-framework-react"]),
    });
    const firstEmission = generateConfigSource(config, matrix);

    const loaded = await writeAndLoadProjectConfig(config);

    // Subject guard: both entries survived with both overrides; `toStrictEqual` ignores key order.
    expect(loaded.agents).toStrictEqual(agents);
    expect(
      generateConfigSource(loaded, matrix),
      "writing back a config just read off disk must not move a single byte",
    ).toBe(firstEmission);
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
