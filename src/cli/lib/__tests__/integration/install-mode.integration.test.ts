import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectConfig, SkillId } from "../../../types";
import type { SkillConfig } from "../../../types/config";
import type { SourceLoadResult } from "../../loading/source-loader";
import {
  installEject,
  buildAndMergeConfig,
  writeConfigFile,
} from "../../installation/local-installer";
import { deriveInstallMode } from "../../installation/installation";
import { initializeMatrix } from "../../matrix/matrix-provider";
import {
  buildProjectConfig,
  buildWizardResult,
  buildSourceResult,
} from "../factories/config-factories.js";
import { readTestTsConfig, writeTestTsConfig } from "../helpers/config-io.js";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { createTempDir, cleanupTempDir, fileExists } from "../test-fs-utils";
import { FULLSTACK_TRIO_MATRIX } from "../mock-data/mock-matrices";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import { INIT_SKILL_IDS, INIT_TEST_SKILLS } from "../mock-data/mock-skills";
import { CLAUDE_SRC_DIR, STANDARD_FILES } from "../../../consts";
import path from "path";
import { mkdir } from "fs/promises";

const REACT_SKILL_ID: SkillId = "web-framework-react";
const HONO_SKILL_ID: SkillId = "api-framework-hono";
const VITEST_SKILL_ID: SkillId = "web-testing-vitest";

const INIT_TEST_MATRIX = FULLSTACK_TRIO_MATRIX;

/** Mixed-source skill set: react local (eject), hono plugin, vitest local. */
const MIXED_SOURCE_SKILLS: SkillConfig[] = [
  { id: REACT_SKILL_ID, scope: "project", source: "eject" },
  { id: HONO_SKILL_ID, scope: "project", source: "agents-inc" },
  { id: VITEST_SKILL_ID, scope: "project", source: "eject" },
];

// Shared per-test source setup for the install-mode suites (the
// writeConfigFile suite manages its own temp dir instead)
let dirs: TestDirs;
let sourceResult: SourceLoadResult;

beforeEach(async () => {
  dirs = await createTestSource({ skills: INIT_TEST_SKILLS });
  sourceResult = buildSourceResult(INIT_TEST_MATRIX, dirs.sourceDir);
  initializeMatrix(INIT_TEST_MATRIX);
});

afterEach(async () => {
  await cleanupTestSource(dirs);
});

describe("Integration: Install Mode Persistence", () => {
  it("should persist skills with 'local' source in config after install", async () => {
    const skills = buildSkillConfigs(INIT_SKILL_IDS, { source: "eject" });
    const result = await installEject({
      wizardResult: buildWizardResult(skills, {
        selectedAgents: ["web-developer"],
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);
    expect(deriveInstallMode(config.skills)).toBe("eject");
  });

  it("should persist skills with 'plugin' source in config after install", async () => {
    const skills = buildSkillConfigs(INIT_SKILL_IDS, { source: "agents-inc" });
    const result = await installEject({
      wizardResult: buildWizardResult(skills, {
        selectedAgents: ["web-developer"],
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);
    expect(deriveInstallMode(config.skills)).toBe("plugin");
  });

  it("should persist skills with 'mixed' sources in config after install", async () => {
    const skills: SkillConfig[] = [
      ...MIXED_SOURCE_SKILLS.slice(0, 2),
      { id: VITEST_SKILL_ID, scope: "project", source: "agents-inc" },
    ];
    const result = await installEject({
      wizardResult: buildWizardResult(skills, {
        selectedAgents: ["web-developer"],
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);
    expect(deriveInstallMode(config.skills)).toBe("mixed");
  });

  it("should persist per-skill source in config after install", async () => {
    const skills = MIXED_SOURCE_SKILLS;

    const result = await installEject({
      wizardResult: buildWizardResult(skills, {
        selectedAgents: ["web-developer"],
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);
    const reactConfig = config.skills.find((s) => s.id === REACT_SKILL_ID);
    const honoConfig = config.skills.find((s) => s.id === HONO_SKILL_ID);
    const vitestConfig = config.skills.find((s) => s.id === VITEST_SKILL_ID);
    expect(reactConfig?.source).toBe("eject");
    expect(honoConfig?.source).toBe("agents-inc");
    expect(vitestConfig?.source).toBe("eject");
  });

  it("should have all skills as local when no explicit source set", async () => {
    const skills = buildSkillConfigs(INIT_SKILL_IDS, { source: "eject" });
    const result = await installEject({
      wizardResult: buildWizardResult(skills, {
        selectedAgents: ["web-developer"],
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);
    for (const skill of config.skills) {
      expect(skill.source).toBe("eject");
    }
  });
});

describe("Integration: Install Mode Config Round-Trip", () => {
  it("should round-trip install mode through config write and read", async () => {
    // First install with "eject" sources
    const localSkills = buildSkillConfigs(INIT_SKILL_IDS, { source: "eject" });
    const result1 = await installEject({
      wizardResult: buildWizardResult(localSkills, {
        selectedAgents: ["web-developer"],
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config1 = await readTestTsConfig<ProjectConfig>(result1.configPath);
    expect(deriveInstallMode(config1.skills)).toBe("eject");

    // Second install with "plugin" sources — config gets overwritten
    const pluginSkills = buildSkillConfigs(INIT_SKILL_IDS, { source: "agents-inc" });
    const result2 = await installEject({
      wizardResult: buildWizardResult(pluginSkills, {
        selectedAgents: ["web-developer"],
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config2 = await readTestTsConfig<ProjectConfig>(result2.configPath);
    expect(deriveInstallMode(config2.skills)).toBe("plugin");
  });

  it("should round-trip per-skill source through config write and read", async () => {
    const skills = MIXED_SOURCE_SKILLS;

    const result = await installEject({
      wizardResult: buildWizardResult(skills, {
        selectedAgents: ["web-developer"],
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);
    const reactConfig = config.skills.find((s) => s.id === REACT_SKILL_ID);
    const honoConfig = config.skills.find((s) => s.id === HONO_SKILL_ID);
    expect(reactConfig?.source).toBe("eject");
    expect(honoConfig?.source).toBe("agents-inc");
  });
});

describe("Integration: buildAndMergeConfig Install Mode", () => {
  it("should derive installMode from skills in merged config", async () => {
    const skills = buildSkillConfigs(INIT_SKILL_IDS, { source: "agents-inc" });
    const wizardResult = buildWizardResult(skills, {
      selectedAgents: ["web-developer"],
    });

    const mergeResult = await buildAndMergeConfig(wizardResult, sourceResult, dirs.projectDir);

    expect(deriveInstallMode(mergeResult.config.skills)).toBe("plugin");
  });

  it("should preserve per-skill source in merged config when non-uniform", async () => {
    const skills = MIXED_SOURCE_SKILLS;

    const wizardResult = buildWizardResult(skills, {
      selectedAgents: ["web-developer"],
    });

    const mergeResult = await buildAndMergeConfig(wizardResult, sourceResult, dirs.projectDir);

    const reactConfig = mergeResult.config.skills.find((s) => s.id === REACT_SKILL_ID);
    const honoConfig = mergeResult.config.skills.find((s) => s.id === HONO_SKILL_ID);
    expect(reactConfig?.source).toBe("eject");
    expect(honoConfig?.source).toBe("agents-inc");
  });

  it("should have all-local skills in merged config when all sources are local", async () => {
    const skills = buildSkillConfigs(INIT_SKILL_IDS, { source: "eject" });
    const wizardResult = buildWizardResult(skills, {
      selectedAgents: ["web-developer"],
    });

    const mergeResult = await buildAndMergeConfig(wizardResult, sourceResult, dirs.projectDir);

    for (const skill of mergeResult.config.skills) {
      expect(skill.source).toBe("eject");
    }
  });

  it("should merge with existing config preserving install mode from new wizard result", async () => {
    // Write initial config with "eject" source skills
    await writeTestTsConfig(
      dirs.projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs([REACT_SKILL_ID]),
      }) as Record<string, unknown>,
    );

    // Build wizard result with "plugin" source skills
    const skills = buildSkillConfigs(INIT_SKILL_IDS, { source: "agents-inc" });
    const wizardResult = buildWizardResult(skills, {
      selectedAgents: ["web-developer"],
    });

    const mergeResult = await buildAndMergeConfig(wizardResult, sourceResult, dirs.projectDir);

    // New wizard result's skills should take precedence
    expect(deriveInstallMode(mergeResult.config.skills)).toBe("plugin");
    expect(mergeResult.merged).toBe(true);
  });
});

describe("Integration: writeConfigFile Round-Trip", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await createTempDir("config-roundtrip-");
    const configDir = path.join(tempDir, CLAUDE_SRC_DIR);
    await mkdir(configDir, { recursive: true });
    configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should write and read back skills with derived installMode", async () => {
    const config = buildProjectConfig({
      skills: [
        { id: REACT_SKILL_ID, scope: "project", source: "eject" },
        { id: HONO_SKILL_ID, scope: "project", source: "agents-inc" },
      ],
    });

    await writeConfigFile(config, configPath);

    expect(await fileExists(configPath)).toBe(true);
    const readBack = await readTestTsConfig<ProjectConfig>(configPath);
    expect(deriveInstallMode(readBack.skills)).toBe("mixed");
  });

  it("should write and read back per-skill source", async () => {
    const config = buildProjectConfig({
      skills: [
        { id: REACT_SKILL_ID, scope: "project", source: "eject" },
        { id: HONO_SKILL_ID, scope: "project", source: "agents-inc" },
      ],
    });

    await writeConfigFile(config, configPath);

    const readBack = await readTestTsConfig<ProjectConfig>(configPath);
    const reactConfig = readBack.skills.find((s) => s.id === REACT_SKILL_ID);
    const honoConfig = readBack.skills.find((s) => s.id === HONO_SKILL_ID);
    expect(reactConfig?.source).toBe("eject");
    expect(honoConfig?.source).toBe("agents-inc");
  });

  it("should write config with all-local skills correctly", async () => {
    const config = buildProjectConfig({
      skills: [{ id: REACT_SKILL_ID, scope: "project", source: "eject" }],
    });

    await writeConfigFile(config, configPath);

    const readBack = await readTestTsConfig<ProjectConfig>(configPath);
    expect(deriveInstallMode(readBack.skills)).toBe("eject");
  });
});
