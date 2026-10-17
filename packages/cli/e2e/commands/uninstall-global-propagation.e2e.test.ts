import path from "path";
import { realpathSync } from "fs";
import { describe, it, expect, afterEach } from "vitest";
import {
  compactCliOutput,
  createTempDir,
  cleanupTempDir,
  fileExists,
  readTestFile,
  runCLI,
  writeProjectConfig,
  writeConfigTypes,
  configTsPath,
  configTypesTsPath,
  loadConfigOrFail,
  createLocalSkill,
  writeAgentFile,
  skillsPath,
  renderMetadataYaml,
  FORKED_FROM_METADATA,
} from "../helpers/test-utils.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";

/**
 * A global uninstall prunes inlined global rows from each registered project and regenerates its
 * config-types.ts in standalone form, leaving project entries untouched; unreachable projects are
 * warned about and skipped.
 */
describe("global uninstall propagates to registered projects", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("prunes inlined global entries from a registered project, preserves project content, and doctor passes", async () => {
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");
    const ghostDir = path.join(tempDir, "ghost-project");

    // Project install with the CLI-inlined snapshot of the global install.
    await writeProjectConfig(projectDir, {
      marketplace: E2E_SOURCE.sourceDir,
      name: "project-test",
      skills: [
        { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" },
        { id: E2E_SKILL.react.id, scope: "global", origin: "eject" },
      ],
      agents: [
        { name: E2E_AGENT["api-developer"].name, scope: "project" },
        { name: E2E_AGENT["web-developer"].name, scope: "global" },
      ],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["api-developer"].name]: {
          "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
          "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: true }],
        },
      },
    });
    await writeConfigTypes(projectDir);
    await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
      description: "Project-scoped skill that must survive the global uninstall",
      metadata: renderMetadataYaml({
        displayName: E2E_SKILL.vitest.display,
        category: "web-testing",
        slug: "vitest",
        cliDescription: "E2E test runner skill",
        usageGuidance: "Use when testing project-scoped survival in E2E scenarios",
        contentHash: "a1b2c3d",
      }),
    });
    await writeAgentFile(projectDir, E2E_AGENT["api-developer"].name, { frontmatter: true });

    // Registers the project as a realpath, matching registerProjectPath, plus a deleted ghost path
    // the uninstall must warn about and skip.
    const realProjectDir = realpathSync(projectDir);
    await writeProjectConfig(globalHome, {
      marketplace: E2E_SOURCE.sourceDir,
      name: "global-test",
      skills: [{ id: E2E_SKILL.react.id, scope: "global", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["web-developer"].name]: {
          "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
        },
      },
      projects: [realProjectDir, ghostDir],
    });
    await writeConfigTypes(globalHome);
    await createLocalSkill(globalHome, E2E_SKILL.react.id, {
      description: "Global skill removed by the uninstall",
      metadata: FORKED_FROM_METADATA,
    });
    await writeAgentFile(globalHome, E2E_AGENT["web-developer"].name, { frontmatter: true });

    // Project skill content must be byte-preserved; the compiled agent is derived from pruned rows,
    // so it is asserted separately.
    const projectSkillMdPath = path.join(
      skillsPath(projectDir),
      E2E_SKILL.vitest.id,
      FILES.SKILL_MD,
    );
    const projectSkillMetaPath = path.join(
      skillsPath(projectDir),
      E2E_SKILL.vitest.id,
      FILES.METADATA_YAML,
    );
    const skillMdBefore = await readTestFile(projectSkillMdPath);
    const skillMetaBefore = await readTestFile(projectSkillMetaPath);

    const { exitCode, stdout, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: globalHome },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // One project updated; the ghost path warned rather than aborting.
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_PROJECTS_UPDATED_ONE);
    expect(compactCliOutput(output)).toContain(
      compactCliOutput(
        `${STEP_TEXT.SKIPPED_REGISTERED_PROJECT} ${ghostDir}: ${STEP_TEXT.REGISTERED_PROJECT_GONE}`,
      ),
    );
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_PROJECT_SKIPPED);

    expect(await fileExists(configTsPath(globalHome))).toBe(false);
    expect(await fileExists(configTypesTsPath(globalHome))).toBe(false);

    const projectConfig = await loadConfigOrFail(projectDir);
    expect(projectConfig.skills).toStrictEqual([
      { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" },
    ]);
    expect(projectConfig.agents).toStrictEqual([
      { name: E2E_AGENT["api-developer"].name, scope: "project" },
    ]);
    expect(projectConfig.stack).toStrictEqual({
      [E2E_AGENT["api-developer"].name]: {
        "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: true }],
      },
    });

    // Either quote style: the config is written with single quotes.
    const rawConfig = await readTestFile(configTsPath(projectDir));
    expect(rawConfig).not.toContain(E2E_SKILL.react.id);
    expect(rawConfig).not.toContain(E2E_AGENT["web-developer"].name);
    expect(rawConfig).not.toMatch(/scope:\s*['"]global['"]/);

    // Regenerated standalone: nothing imports the deleted global config-types.ts.
    const rawTypes = await readTestFile(configTypesTsPath(projectDir));
    expect(rawTypes).toContain(`'${E2E_SKILL.vitest.id}'`);
    expect(rawTypes).not.toContain("GlobalSkillId");
    expect(rawTypes).not.toContain("export type SkillId = string");

    expect(await readTestFile(projectSkillMdPath)).toBe(skillMdBefore);
    expect(await readTestFile(projectSkillMetaPath)).toBe(skillMetaBefore);

    // Recompiled from the pruned config, still preloading its own skill.
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      contains: [E2E_SKILL.vitest.id],
      notContains: [E2E_SKILL.react.id],
    });

    const doctor = await CLI.run(["doctor"], { dir: projectDir }, { env: { HOME: globalHome } });
    expect(doctor.exitCode, doctor.stdout).toBe(EXIT_CODES.SUCCESS);
  });

  /**
   * The compiled agents were built from the pruned global rows, so the prune owes a recompile. Here
   * a real compile makes the agent genuinely preload the global skill.
   */
  it("recompiles a registered project's agents so they stop preloading the pruned global skill", async () => {
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");

    // A project api-developer preloading its own project skill and the inherited global one.
    await writeProjectConfig(projectDir, {
      marketplace: E2E_SOURCE.sourceDir,
      name: "project-recompile",
      skills: [
        { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" },
        { id: E2E_SKILL.react.id, scope: "global", origin: "eject" },
      ],
      agents: [{ name: E2E_AGENT["api-developer"].name, scope: "project" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["api-developer"].name]: {
          "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
          "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: true }],
        },
      },
    });
    await writeConfigTypes(projectDir);
    await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
      description: "Project-scoped skill that must survive the global uninstall",
      metadata: renderMetadataYaml({
        displayName: E2E_SKILL.vitest.display,
        category: "web-testing",
        slug: "vitest",
        cliDescription: "E2E test runner skill",
        usageGuidance: "Use when testing project-scoped survival in E2E scenarios",
        contentHash: "a1b2c3d",
      }),
    });

    await writeProjectConfig(globalHome, {
      marketplace: E2E_SOURCE.sourceDir,
      name: "global-recompile",
      skills: [{ id: E2E_SKILL.react.id, scope: "global", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["web-developer"].name]: {
          "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
        },
      },
      projects: [realpathSync(projectDir)],
    });
    await writeConfigTypes(globalHome);
    await createLocalSkill(globalHome, E2E_SKILL.react.id, {
      description: "Global skill removed by the uninstall",
      metadata: FORKED_FROM_METADATA,
    });

    // A real compile produces the stale artifact.
    const compiled = await runCLI(["compile"], projectDir, {
      env: { HOME: globalHome },
    });
    expect(compiled.exitCode, `project compile must succeed: ${compiled.combined}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      contains: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
    });

    const { exitCode, stdout, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: globalHome },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // Proof the config prune landed.
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_PROJECTS_UPDATED_ONE);
    const projectConfig = await loadConfigOrFail(projectDir);
    expect(projectConfig.skills).toStrictEqual([
      { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" },
    ]);

    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      contains: [E2E_SKILL.vitest.id],
      notContains: [E2E_SKILL.react.id],
    });

    expect(
      output,
      "the uninstall must report recompiling the registered projects it pruned",
    ).toContain(STEP_TEXT.PROPAGATED_RECOMPILE);
  });
});
