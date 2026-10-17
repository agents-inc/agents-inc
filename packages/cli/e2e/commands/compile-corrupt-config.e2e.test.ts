import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  compactCliOutput,
  configTsPath,
  createLocalSkill,
  createTempDir,
  directoryExists,
  fileExists,
  flattenCliOutput,
  listFiles,
  readTestFile,
  renderMetadataYaml,
  runCLI,
  writeCorruptConfig,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { metadataFieldsFor } from "../fixtures/project-builder.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  renderConfigTsWithoutDefaultExport,
  renderUnparseableConfigTs,
} from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * A config.ts that exists but cannot be loaded makes `compile` hard-error naming the file and write
 * no agents. A missing config is not corrupt.
 */

const SKILL_ID = E2E_SKILL.react.id;

const GLOBAL_INSTALL = buildProjectConfig({
  name: "corrupt-config-fixture",
  skills: buildSkillConfigs([SKILL_ID], { scope: "global", origin: "eject" }),
  agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
});

/** A valid-TS file that exports nothing. */
const MISSING_EXPORT_DEFAULT = renderConfigTsWithoutDefaultExport(GLOBAL_INSTALL);

const SYNTAX_ERROR = renderUnparseableConfigTs();

async function seedGlobalInstall(fakeHome: string): Promise<void> {
  await writeProjectConfig(fakeHome, GLOBAL_INSTALL);
  await createLocalSkill(fakeHome, SKILL_ID, {
    description: "Global local skill so the compile pass has a skill to discover",
    metadata: renderMetadataYaml({
      ...metadataFieldsFor(SKILL_ID),
      contentHash: "hash-corrupt-config",
    }),
  });
}

describe("compile with a corrupt config", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("hard-errors naming the config path when the global config is corrupt (missing export default)", async () => {
    tempDir = await createTempDir();
    const fakeHome = path.join(tempDir, "global-home");
    await seedGlobalInstall(fakeHome);
    await writeCorruptConfig(fakeHome, MISSING_EXPORT_DEFAULT);

    // From HOME itself, so detection resolves to a single global pass.
    const { exitCode, combined } = await runCLI(["compile"], fakeHome, {
      env: { HOME: fakeHome },
    });

    expect(exitCode, `compile must reject a corrupt config; output:\n${combined}`).toBe(
      EXIT_CODES.ERROR,
    );
    // Flattened and compacted: oclif wraps at terminal width with ` › ` and breaks long paths
    // mid-word.
    expect(compactCliOutput(combined)).toContain(compactCliOutput(configTsPath(fakeHome)));
    expect(flattenCliOutput(combined)).toContain(STEP_TEXT.CONFIG_LOAD_FAILED);
    expect(combined).not.toContain(STEP_TEXT.COMPILE_COMPLETE);
  });

  it("writes no agents and leaves config untouched when the config is corrupt", async () => {
    tempDir = await createTempDir();
    const fakeHome = path.join(tempDir, "global-home");
    await seedGlobalInstall(fakeHome);
    await writeCorruptConfig(fakeHome, MISSING_EXPORT_DEFAULT);

    const agentsBefore = await listFiles(agentsPath(fakeHome));
    const configBefore = await readTestFile(configTsPath(fakeHome));

    const { exitCode } = await runCLI(["compile"], fakeHome, { env: { HOME: fakeHome } });
    expect(exitCode).toBe(EXIT_CODES.ERROR);

    expect(
      (await listFiles(agentsPath(fakeHome))).sort(),
      "a corrupt config must not resurrect any agents",
    ).toStrictEqual(agentsBefore.sort());
    expect(await readTestFile(configTsPath(fakeHome))).toBe(configBefore);
  });

  it("hard-errors when a project-scope config is corrupt (syntax error)", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const cleanHome = path.join(tempDir, "clean-home");
    await mkdir(cleanHome, { recursive: true });
    await seedGlobalInstall(projectDir);
    await writeCorruptConfig(projectDir, SYNTAX_ERROR);

    // cwd distinct from HOME, so the corrupt config is the project's.
    const { exitCode, combined } = await runCLI(["compile"], projectDir, {
      env: { HOME: cleanHome },
    });

    expect(exitCode, `compile must reject a corrupt project config; output:\n${combined}`).toBe(
      EXIT_CODES.ERROR,
    );
    expect(compactCliOutput(combined)).toContain(compactCliOutput(configTsPath(projectDir)));
    expect(combined).not.toContain(STEP_TEXT.COMPILE_COMPLETE);

    expect(await listFiles(agentsPath(projectDir))).toStrictEqual([]);
  });

  it("still compiles when the config is intact (green guard)", async () => {
    tempDir = await createTempDir();
    const fakeHome = path.join(tempDir, "global-home");
    await seedGlobalInstall(fakeHome);

    const { exitCode, combined } = await runCLI(["compile"], fakeHome, {
      env: { HOME: fakeHome },
    });

    expect(exitCode, `intact config must compile; output:\n${combined}`).toBe(EXIT_CODES.SUCCESS);
    expect(combined).toContain(STEP_TEXT.COMPILE_COMPLETE);
    await expect(fileExists(path.join(agentsPath(fakeHome), "web-developer.md"))).resolves.toBe(
      true,
    );
  });

  it("keeps the existing no-installation behavior when no config file exists (green guard)", async () => {
    tempDir = await createTempDir();
    const fakeHome = path.join(tempDir, "global-home");
    // A missing config is not corrupt: compile gives its no-installation error instead.
    await createLocalSkill(fakeHome, SKILL_ID, {
      description: "Local skill with no config present",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor(SKILL_ID),
        contentHash: "hash-no-config",
      }),
    });

    const { exitCode, combined } = await runCLI(["compile"], fakeHome, {
      env: { HOME: fakeHome },
    });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(combined).toContain(STEP_TEXT.NO_INSTALLATION);
    expect(combined).not.toContain(STEP_TEXT.CONFIG_LOAD_FAILED);
    expect(await directoryExists(agentsPath(fakeHome))).toBe(false);
  });
});
