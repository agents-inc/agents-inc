import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  createLocalSkill,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  readTestFile,
  renderMetadataYaml,
  writeConfigTypes,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";
import path from "path";

/**
 * The documented hand-edit workflow is "edit config.ts, then run compile".
 * config-types.ts holds type unions derived from config.ts, so compile must
 * regenerate it at every scope it compiles — otherwise a hand-edit strands
 * stale unions (an added skill stays a type error, a removed one stays valid).
 */
describe("compile refreshes config-types.ts from the persisted config", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("regenerates the unions after a hand-edit that adds and removes skills", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    // Two skills installed on disk; only react is configured initially, so the
    // union must follow the config, not the filesystem.
    await createLocalSkill(projectDir, "web-framework-react", {
      description: "Installed skill later removed from config by hand",
      metadata: renderMetadataYaml({ contentHash: "hash-react" }),
    });
    await createLocalSkill(projectDir, "web-testing-vitest", {
      description: "Installed skill later added to config by hand",
      metadata: renderMetadataYaml({ contentHash: "hash-vitest" }),
    });
    await writeProjectConfig(projectDir, {
      name: "e2e-types-refresh",
      skills: [{ id: "web-framework-react", scope: "project", source: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
    });

    const firstRun = await CLI.run(["compile"], { dir: projectDir });

    expect(firstRun.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(firstRun.output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);
    expect(await fileExists(configTypesTsPath(projectDir))).toBe(true);

    const firstTypes = await readTestFile(configTypesTsPath(projectDir));
    expect(firstTypes).toContain('export type SkillId = "web-framework-react";');
    expect(firstTypes, "union must follow config.ts, not installed files").not.toContain(
      '"web-testing-vitest"',
    );

    // Hand-edit: remove react, add vitest (installed) and web-mocks-msw (never
    // installed — no files on disk). A stack entry references the missing skill
    // so the configured-but-not-found warning path is exercised too.
    await writeProjectConfig(projectDir, {
      name: "e2e-types-refresh",
      skills: [
        { id: "web-testing-vitest", scope: "project", source: "eject" },
        { id: "web-mocks-msw", scope: "project", source: "eject" },
      ],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      stack: { "web-developer": { "web-mocking": [{ id: "web-mocks-msw" }] } },
    });
    const editedConfig = await readTestFile(configTsPath(projectDir));

    const secondRun = await CLI.run(["compile"], { dir: projectDir });

    expect(secondRun.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(secondRun.output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);
    // Not-installed skills still warn — regeneration must not change that
    expect(secondRun.output).toContain(`'web-mocks-msw' ${STEP_TEXT.SKILL_NOT_FOUND_WARNING}`);

    const secondTypes = await readTestFile(configTypesTsPath(projectDir));
    // The union is rebuilt from the edited config's entries: the added skills are
    // in (including the not-installed one), the removed skill is out even though
    // its files are still on disk
    expect(secondTypes).toContain('export type SkillId = "web-mocks-msw" | "web-testing-vitest";');
    expect(secondTypes).not.toContain('"web-framework-react"');
    expect(secondTypes).toContain(`export type AgentName = "${E2E_AGENT["web-developer"].name}";`);

    // Compile refreshes config-types.ts only — the hand-edited config.ts must
    // stay byte-identical, and the agents must still be compiled
    expect(await readTestFile(configTsPath(projectDir))).toBe(editedConfig);
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      contains: [`name: ${E2E_AGENT["web-developer"].name}`],
    });
  });

  it("regenerates the unions on a zero-skill pass when config.ts lists skills but nothing is installed", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    // Hand-edited config.ts listing a skill and an agent while NO skill files
    // exist anywhere for this scope — the compile pass discovers zero skills.
    await writeProjectConfig(projectDir, {
      name: "e2e-zero-skill-refresh",
      skills: [{ id: "web-framework-react", scope: "project", source: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
    });
    // Stale collapsed stub — the post-run content must differ, proving the
    // zero-skill pass still rewrote the file.
    await writeConfigTypes(projectDir);
    const configBefore = await readTestFile(configTsPath(projectDir));

    const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

    // Zero skills in every pass is still a hard error — but the config-types
    // refresh must have run on the early-return path before it.
    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(output).toContain(STEP_TEXT.COMPILE_PASS_NO_SKILLS);
    expect(output).toContain(STEP_TEXT.COMPILE_NO_SKILLS_ERROR);
    expect(output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);

    // The unions follow the hand-edited config even though nothing is installed
    const types = await readTestFile(configTypesTsPath(projectDir));
    expect(types).toContain('export type SkillId = "web-framework-react";');
    expect(types).toContain(`export type AgentName = "${E2E_AGENT["web-developer"].name}";`);
    expect(types, "stale stub must be replaced").not.toContain("export type SkillId = string;");

    // The refresh touches only config-types.ts — config.ts stays byte-identical
    // and no agents were compiled
    expect(await readTestFile(configTsPath(projectDir))).toBe(configBefore);
    expect(await directoryExists(agentsPath(projectDir))).toBe(false);
  });

  it("dual-pass compile regenerates both scopes in their own shapes", async () => {
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");

    // Global install: one global-scoped skill + agent
    await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
      description: "Global skill for dual-scope types refresh",
      metadata: renderMetadataYaml({ contentHash: "hash-global" }),
    });
    await writeProjectConfig(globalHome, {
      name: "e2e-global",
      skills: [{ id: "web-testing-cypress-e2e", scope: "global", source: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
    });

    // Project install: one project-scoped skill + agent
    await createLocalSkill(projectDir, "web-testing-playwright-e2e", {
      description: "Project skill for dual-scope types refresh",
      metadata: renderMetadataYaml({ contentHash: "hash-project" }),
    });
    await writeProjectConfig(projectDir, {
      name: "e2e-project",
      skills: [{ id: "web-testing-playwright-e2e", scope: "project", source: "eject" }],
      agents: [{ name: E2E_AGENT["api-developer"].name, scope: "project" }],
    });

    // Seed stale collapsed stubs at BOTH scopes: the post-run content must
    // differ, proving each pass actually rewrote its file
    await writeConfigTypes(globalHome);
    await writeConfigTypes(projectDir);
    const globalConfigBefore = await readTestFile(configTsPath(globalHome));
    const projectConfigBefore = await readTestFile(configTsPath(projectDir));

    const { exitCode, output } = await CLI.run(
      ["compile"],
      { dir: projectDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("Compiling global agents");
    expect(output).toContain("Compiling project agents");
    expect(output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);

    // Global scope: standalone unions narrowed to the global config's entries
    const globalTypes = await readTestFile(configTypesTsPath(globalHome));
    expect(globalTypes).not.toContain("as GlobalSkillId");
    expect(globalTypes).toContain('export type SkillId = "web-testing-cypress-e2e";');
    expect(globalTypes).not.toContain('"web-testing-playwright-e2e"');
    expect(globalTypes, "stale stub must be replaced").not.toContain(
      "export type SkillId = string;",
    );

    // Project scope: import-and-extend form on top of the fresh global types
    const projectTypes = await readTestFile(configTypesTsPath(projectDir));
    expect(projectTypes).toContain("SkillId as GlobalSkillId");
    expect(projectTypes).toContain(
      'export type SkillId = GlobalSkillId | "web-testing-playwright-e2e"',
    );
    expect(projectTypes).not.toContain('"web-testing-cypress-e2e"');
    expect(projectTypes, "stale stub must be replaced").not.toContain(
      "export type SkillId = string;",
    );

    // Refresh touches only config-types.ts — both configs stay byte-identical,
    // and the global agent is still compiled
    expect(await readTestFile(configTsPath(globalHome))).toBe(globalConfigBefore);
    expect(await readTestFile(configTsPath(projectDir))).toBe(projectConfigBefore);
    await expect({ dir: globalHome }).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      contains: [`name: ${E2E_AGENT["web-developer"].name}`],
    });
  });
});
