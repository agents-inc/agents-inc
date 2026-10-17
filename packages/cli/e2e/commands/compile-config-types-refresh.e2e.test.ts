import { describe, it, expect, afterEach } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  createLocalSkill,
  createTempDir,
  directoryExists,
  fileExists,
  readTestFile,
  renderMetadataYaml,
  writeConfigTypes,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { readGeneratedUnion } from "../../src/cli/lib/__tests__/helpers/generated-types.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";
import path from "path";
import { metadataFieldsFor } from "../fixtures/project-builder.js";

/**
 * compile regenerates config-types.ts from config.ts at every scope it compiles, so a hand edit
 * never strands stale unions.
 */
describe("compile refreshes config-types.ts from the persisted config", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("regenerates the unions after a hand-edit that adds and removes skills", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    // Only react is configured, so the union must follow the config, not the filesystem.
    await createLocalSkill(projectDir, E2E_SKILL.react.id, {
      description: "Installed skill later removed from config by hand",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor(E2E_SKILL.react.id),
        contentHash: "hash-react",
      }),
    });
    await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
      description: "Installed skill later added to config by hand",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor(E2E_SKILL.vitest.id),
        contentHash: "hash-vitest",
      }),
    });
    await writeProjectConfig(projectDir, {
      name: "e2e-types-refresh",
      skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
    });

    const firstRun = await CLI.run(["compile"], { dir: projectDir });

    expect(firstRun.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(firstRun.output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);
    expect(await fileExists(configTypesTsPath(projectDir))).toBe(true);

    // The skill states a real category, so the union carries it without a `// Custom` heading.
    const firstTypes = await readTestFile(configTypesTsPath(projectDir));
    const firstSkillId = readGeneratedUnion(firstTypes, "SkillId");
    expect(firstSkillId, "config-types.ts must declare a SkillId alias").toBeDefined();
    expect(firstSkillId?.trim()).toBe(`'${E2E_SKILL.react.id}'`);
    expect(firstTypes, "union must follow config.ts, not installed files").not.toContain(
      `'${E2E_SKILL.vitest.id}'`,
    );

    // Removes react; adds vitest (installed) and web-mocks-msw (not installed, so the not-found
    // warning fires).
    await writeProjectConfig(projectDir, {
      name: "e2e-types-refresh",
      skills: [
        { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" },
        { id: "web-mocks-msw", scope: "project", origin: "eject" },
      ],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      stack: { "web-developer": { "web-mocking": [{ id: "web-mocks-msw" }] } },
    });
    const editedConfig = await readTestFile(configTsPath(projectDir));

    const secondRun = await CLI.run(["compile"], { dir: projectDir });

    expect(secondRun.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(secondRun.output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);
    expect(secondRun.output).toContain(`'web-mocks-msw' ${STEP_TEXT.SKILL_NOT_FOUND_WARNING}`);

    const secondTypes = await readTestFile(configTypesTsPath(projectDir));
    // Rebuilt from the edited config: added skills are in whether installed or not, the removed one
    // is out though its files remain.
    const secondSkillId = readGeneratedUnion(secondTypes, "SkillId");
    expect(secondSkillId, "config-types.ts must declare a SkillId alias").toBeDefined();
    expect(secondSkillId?.trim()).toBe(`'${E2E_SKILL.vitest.id}' | 'web-mocks-msw'`);
    expect(secondTypes).not.toContain(`'${E2E_SKILL.react.id}'`);
    expect(secondTypes).toContain(`export type AgentName = '${E2E_AGENT["web-developer"].name}'`);

    expect(await readTestFile(configTsPath(projectDir))).toBe(editedConfig);
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      contains: [`name: ${E2E_AGENT["web-developer"].name}`],
    });
  });

  /** A refused compile writes nothing, so the stale types file stays as it was. */
  it("writes nothing when it refuses a zero-skill pass, even though config.ts lists skills", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    // Config lists a skill and an agent but no skill files exist, so compile discovers zero skills.
    await writeProjectConfig(projectDir, {
      name: "e2e-zero-skill-refresh",
      skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
    });
    // A stale stub a refresh would replace, so its surviving shows the run left it alone.
    await writeConfigTypes(projectDir);
    const configBefore = await readTestFile(configTsPath(projectDir));
    const typesBefore = await readTestFile(configTypesTsPath(projectDir));

    const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(output).toContain(STEP_TEXT.COMPILE_PASS_NO_SKILLS);
    expect(output).toContain(STEP_TEXT.COMPILE_NO_SKILLS_ERROR);
    expect(output, "a refused compile must not claim to have refreshed a file").not.toContain(
      STEP_TEXT.CONFIG_TYPES_REFRESHED,
    );

    expect(
      await readTestFile(configTypesTsPath(projectDir)),
      "a refused compile writes nothing, config-types.ts included",
    ).toBe(typesBefore);
    expect(await readTestFile(configTsPath(projectDir))).toBe(configBefore);
    expect(await directoryExists(agentsPath(projectDir))).toBe(false);
  });

  it("a compile in each context regenerates that scope's types in its own shape", async () => {
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");

    await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
      description: "Global skill for dual-scope types refresh",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor("web-testing-cypress-e2e"),
        contentHash: "hash-global",
      }),
    });
    await writeProjectConfig(globalHome, {
      name: "e2e-global",
      skills: [{ id: "web-testing-cypress-e2e", scope: "global", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
    });

    await createLocalSkill(projectDir, "web-mocks-msw", {
      description: "Project skill for dual-scope types refresh",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor("web-mocks-msw"),
        contentHash: "hash-project",
      }),
    });
    await writeProjectConfig(projectDir, {
      name: "e2e-project",
      skills: [{ id: "web-mocks-msw", scope: "project", origin: "eject" }],
      agents: [{ name: E2E_AGENT["api-developer"].name, scope: "project" }],
    });

    // Stale stubs at both scopes, so each pass must visibly rewrite its file.
    await writeConfigTypes(globalHome);
    await writeConfigTypes(projectDir);
    const globalConfigBefore = await readTestFile(configTsPath(globalHome));
    const projectConfigBefore = await readTestFile(configTsPath(projectDir));

    // A compile inside a project refreshes only that project, so the global half needs its own run
    // from home.
    const globalRun = await CLI.run(
      ["compile"],
      { dir: globalHome },
      { env: { HOME: globalHome } },
    );
    expect(globalRun.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(globalRun.output).toContain("Compiling global agents");
    expect(globalRun.output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);

    const { exitCode, output } = await CLI.run(
      ["compile"],
      { dir: projectDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("Compiling project agents");
    expect(output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);

    const globalTypes = await readTestFile(configTypesTsPath(globalHome));
    expect(globalTypes).not.toContain("as GlobalSkillId");
    expect(globalTypes).toContain("export type SkillId = 'web-testing-cypress-e2e'");
    expect(globalTypes).not.toContain("'web-mocks-msw'");
    expect(globalTypes, "stale stub must be replaced").not.toContain(
      "export type SkillId = string;",
    );

    const projectTypes = await readTestFile(configTypesTsPath(projectDir));
    expect(projectTypes).toContain("SkillId as GlobalSkillId");
    expect(projectTypes).toContain("export type SkillId = GlobalSkillId | 'web-mocks-msw'");
    // Single-quoted, as the file writes skill ids.
    expect(
      projectTypes,
      "the project restates a global skill instead of importing it",
    ).not.toContain("'web-testing-cypress-e2e'");
    expect(projectTypes, "stale stub must be replaced").not.toContain(
      "export type SkillId = string;",
    );

    expect(await readTestFile(configTsPath(globalHome))).toBe(globalConfigBefore);
    expect(await readTestFile(configTsPath(projectDir))).toBe(projectConfigBefore);
    await expect({ dir: globalHome }).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      contains: [`name: ${E2E_AGENT["web-developer"].name}`],
    });
  });
});
