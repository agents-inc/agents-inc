import path from "path";
import { mkdir } from "fs/promises";
import { describe, it, expect, afterAll, afterEach, beforeAll } from "vitest";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import {
  addForkedFromMetadata,
  agentsPath,
  cleanupTempDir,
  configTsPath,
  createLocalSkill,
  createTempDir,
  directoryExists,
  fileExists,
  readTestFile,
  renderMetadataYaml,
  skillsPath,
  sourceFolderIn,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { metadataFieldsFor, ProjectBuilder } from "../fixtures/project-builder.js";
import {
  E2E_MARKETPLACE_PREFIX,
  EXIT_CODES,
  REMOVED_MARKER,
  STEP_TEXT,
  panelRow,
} from "../pages/constants.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import "../matchers/setup.js";

describe("uninstall command", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should display help text with --help flag", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["uninstall", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Remove");
    expect(stdout).toContain("--yes");
    expect(stdout).not.toContain("--all");
    // "matched by source" is where the help names what an installation reads from.
    expect(
      stdout,
      "the description names the marketplace its matching is against, not a source",
    ).not.toMatch(/\bsources?\b/i);
  });

  it("should warn when no installation is found", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["uninstall", "--yes"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.UNINSTALL_NOTHING_TO_UNINSTALL);
    expect(output).toContain(STEP_TEXT.UNINSTALL_NOT_INSTALLED);
    expect(output).toContain(STEP_TEXT.UNINSTALL_NO_CHANGES_MADE);
    // A run that deleted everything and reported an empty directory would print the same three
    // lines.
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_SUCCESS);
  });

  it("should remove skills, agents and the config manifest with --yes", async () => {
    const project = await ProjectBuilder.editable();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;

    await addForkedFromMetadata(projectDir, E2E_SKILL.react.id);

    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: "test-edit-project",
        skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project", origin: "eject" }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
        selectedDomains: ["web"],
      }),
    );
    await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name, { frontmatter: true });

    // Everything to remove exists first, or the post-conditions pass on a no-op.
    const configDir = sourceFolderIn(projectDir);
    expect(await directoryExists(skillsPath(projectDir))).toBe(true);
    expect(await directoryExists(agentsPath(projectDir))).toBe(true);
    expect(
      await fileExists(path.join(agentsPath(projectDir), `${E2E_AGENT["web-developer"].name}.md`)),
    ).toBe(true);
    expect(await directoryExists(configDir)).toBe(true);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
    expect(stdout).toContain(panelRow(REMOVED_MARKER, E2E_AGENT["web-developer"].name));

    await expectCleanUninstall(projectDir, { removeConfig: true });

    expect(await directoryExists(configDir)).toBe(false);
  });

  it("should preserve agents not listed in config", async () => {
    const project = await ProjectBuilder.editable();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;

    await writeAgentFile(projectDir, "my-custom-agent", { body: "# Custom Agent" });

    const { exitCode } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const agentsDir = agentsPath(projectDir);
    expect(await fileExists(path.join(agentsDir, "my-custom-agent.md"))).toBe(true);

    expect(await fileExists(path.join(agentsDir, `${E2E_AGENT["web-developer"].name}.md`))).toBe(
      false,
    );
  });

  it("should skip user-created skills without forkedFrom metadata", async () => {
    const project = await ProjectBuilder.editable();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;

    await createLocalSkill(projectDir, "my-custom-skill", {
      description: "User created",
      body: "# My Custom Skill",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor("my-custom-skill"),
        author: "@user",
        contentHash: "user-hash",
      }),
    });

    await addForkedFromMetadata(projectDir, E2E_SKILL.react.id);

    const { exitCode, output } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    expect(output).not.toContain("Skipping");

    await expectCleanUninstall(projectDir, {
      preservedSkills: ["my-custom-skill"],
    });
  });

  it("should skip all skills when only user-created skills exist", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    // No `forkedFrom`, so nothing marks it as this CLI's.
    const userSkillDir = await createLocalSkill(projectDir, "my-custom-skill", {
      description: "User created",
      body: "# My Custom Skill",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor("my-custom-skill"),
        author: "@user",
        contentHash: "user-hash",
      }),
    });

    const { exitCode, output } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).not.toContain("Skipping");
    expect(output).toContain(STEP_TEXT.UNINSTALL_NOTHING_TO_UNINSTALL);
    expect(await directoryExists(userSkillDir)).toBe(true);
  });

  it("should print the panel of what it removes, and the config files under it, before proceeding with --yes", async () => {
    const project = await ProjectBuilder.editable();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;

    await addForkedFromMetadata(projectDir, E2E_SKILL.react.id);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.PANEL_HEADER);
    // Named as its copy's metadata.yaml names it (`FORKED_FROM_METADATA`), not by the id it records.
    expect(stdout).toContain(panelRow(REMOVED_MARKER, "web-framework-react"));
    expect(stdout).not.toContain(`${REMOVED_MARKER} ${E2E_MARKETPLACE_PREFIX}`);
    expect(stdout).toContain(`${REMOVED_MARKER} ${configTsPath(projectDir)}`);
    expect(
      stdout.indexOf(STEP_TEXT.PANEL_HEADER),
      "the plan prints before the removals",
    ).toBeLessThan(stdout.indexOf(STEP_TEXT.UNINSTALL_SUCCESS));
  });

  it("should report nothing to uninstall for empty directory with HOME override", async () => {
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const emptyDir = path.join(tempDir, "empty-project");
    await mkdir(globalHome, { recursive: true });
    await mkdir(emptyDir, { recursive: true });

    await writeProjectConfig(
      globalHome,
      buildProjectConfig({ name: "global-test", skills: [], agents: [] }),
    );

    const { exitCode, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: emptyDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.UNINSTALL_NOTHING_TO_UNINSTALL);
  });

  /**
   * With no config, `removeMatchingAgents` cannot identify the agents and leaves them, so there is
   * nothing to uninstall and no removal heading. HOME apart from the project, or the global branch
   * runs.
   */
  it("should report nothing to uninstall when unidentifiable agents are all that is installed", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });
    await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name, { frontmatter: true });

    const agentFile = path.join(agentsPath(projectDir), `${E2E_AGENT["web-developer"].name}.md`);
    const agentBefore = await readTestFile(agentFile);

    const { exitCode, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: projectDir },
      { env: { HOME: projectHome } },
    );

    expect(exitCode, `uninstall output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.UNINSTALL_NOTHING_TO_UNINSTALL);
    expect(output).toContain(STEP_TEXT.UNINSTALL_NOT_INSTALLED);

    expect(output).not.toContain(STEP_TEXT.PANEL_HEADER);
    expect(output).not.toContain(panelRow(REMOVED_MARKER, E2E_AGENT["web-developer"].name));
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await fileExists(agentFile)).toBe(true);
    expect(await readTestFile(agentFile)).toBe(agentBefore);
    await expectNoSourceFolder(
      projectDir,
      "a declined uninstall in a project that never had one leaves no source folder",
    );
  });

  it("should succeed with --yes when config dir exists but no skills", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    await writeProjectConfig(
      projectDir,
      buildProjectConfig({ name: "config-only-test", skills: [], agents: [] }),
    );

    const configDir = sourceFolderIn(projectDir);
    expect(await directoryExists(configDir)).toBe(true);

    const { exitCode } = await CLI.run(["uninstall", "--yes"], {
      dir: projectDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    await expectCleanUninstall(projectDir, { removeConfig: true });
  });
});

/** Copies as `init --from` writes them, each metadata.yaml naming its skill as the source does. */
describe("uninstall of the copies init --from installed", () => {
  const WEB_DEV = E2E_AGENT["web-developer"].name;
  const INSTALLED_ID = "UninstallNames1";
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    const copiedFor = buildSeedSkill({
      install: "eject",
      scope: "project",
      assignments: { [WEB_DEV]: "lazy" },
    });
    store.publish(
      INSTALLED_ID,
      buildSeedPayload({
        skills: { [E2E_SKILL.react.id]: copiedFor, [E2E_SKILL.zustand.id]: copiedFor },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it("names each skill it removes as its copy does, and says every skill was ejected", async () => {
    env = await createTestEnvironment();
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    const installed = await runInitFrom(store, INSTALLED_ID, project, E2E_SOURCE.sourceDir);
    expect(installed.exitCode, installed.output).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], project);

    expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.PANEL_ALL_SKILLS_EJECTED);
    expect(stdout).toContain(panelRow(REMOVED_MARKER, E2E_SKILL.react.display));
    expect(stdout).toContain(panelRow(REMOVED_MARKER, E2E_SKILL.zustand.display));
    expect(stdout).not.toContain(`${REMOVED_MARKER} ${E2E_MARKETPLACE_PREFIX}`);
  });
});
