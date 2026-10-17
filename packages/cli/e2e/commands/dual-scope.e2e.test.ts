import path from "path";
import { mkdir } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  directoryExists,
  listFiles,
  agentsPath,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { metadataFieldsFor, ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";

describe("dual-scope compile", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should compile global agents referencing only global skills", async () => {
    const { project, globalHome } = await ProjectBuilder.dualScope();
    tempDir = path.dirname(project.dir);

    // The project run below must leave the home run's global agents as written.
    const global = await CLI.run(
      ["compile"],
      { dir: globalHome.dir },
      { env: { HOME: globalHome.dir } },
    );
    expect(global.exitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode } = await CLI.run(
      ["compile"],
      { dir: project.dir },
      { env: { HOME: globalHome.dir } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: globalHome.dir }).toHaveCompiledAgentContent(
      E2E_AGENT["web-developer"].name,
      {
        contains: ["web-testing-cypress-e2e"],
        notContains: ["web-mocks-msw"],
      },
    );

    await expect({ dir: globalHome.dir }).toHaveCompiledAgentContent(
      E2E_AGENT["web-developer"].name,
      {
        notContains: [E2E_SKILL.hono.id],
      },
    );
  });

  it("should compile project agents referencing both global and project skills", async () => {
    const { project, globalHome } = await ProjectBuilder.dualScope();
    tempDir = path.dirname(project.dir);

    const { exitCode } = await CLI.run(
      ["compile"],
      { dir: project.dir },
      { env: { HOME: globalHome.dir } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: project.dir }).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      contains: ["web-mocks-msw", "web-testing-cypress-e2e"],
    });

    await expect({ dir: project.dir }).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      notContains: [E2E_SKILL.react.id],
    });
  });

  it("should work with global-only installation", async () => {
    tempDir = await createTempDir();

    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });

    await writeProjectConfig(globalHome, {
      name: "global-test",
      skills: [{ id: "web-testing-cypress-e2e", scope: "global", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["web-developer"].name]: {
          "web-e2e": [{ id: "web-testing-cypress-e2e", preloaded: true }],
        },
      },
    });

    await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
      description: "Global skill for single-scope test",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor("web-testing-cypress-e2e"),
        contentHash: "hash-global",
      }),
    });

    const { exitCode } = await CLI.run(
      ["compile"],
      { dir: projectDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: globalHome }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);

    const projectAgentsExist = await directoryExists(agentsPath(projectDir));
    expect(projectAgentsExist).toBe(false);
  });

  it("should work with project-only installation", async () => {
    tempDir = await createTempDir();

    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");
    await mkdir(globalHome, { recursive: true });

    await writeProjectConfig(projectDir, {
      name: "project-test",
      skills: [{ id: "web-mocks-msw", scope: "project", origin: "eject" }],
      agents: [{ name: E2E_AGENT["api-developer"].name, scope: "project" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["api-developer"].name]: {
          "web-mocking": [{ id: "web-mocks-msw", preloaded: true }],
        },
      },
    });

    await createLocalSkill(projectDir, "web-mocks-msw", {
      description: "Project skill for single-scope test",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor("web-mocks-msw"),
        contentHash: "hash-local",
      }),
    });

    const { exitCode } = await CLI.run(
      ["compile"],
      { dir: projectDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: projectDir }).toHaveCompiledAgent(E2E_AGENT["api-developer"].name);

    // The global agents directory is always created, but a project-only install writes no agents
    // there.
    const globalAgentFiles = await listFiles(agentsPath(globalHome));
    const globalMdFiles = globalAgentFiles.filter((f) => f.endsWith(".md"));
    expect(globalMdFiles.length).toBe(0);
  });

  it("should include global-only skills in project agent when project has no local skills", async () => {
    tempDir = await createTempDir();

    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");

    await writeProjectConfig(globalHome, {
      name: "global-test",
      skills: [{ id: "web-testing-cypress-e2e", scope: "global", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["web-developer"].name]: {
          "web-e2e": [{ id: "web-testing-cypress-e2e", preloaded: true }],
        },
      },
    });

    await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
      description: "Global skill for cross-scope test",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor("web-testing-cypress-e2e"),
        contentHash: "hash-global",
      }),
    });

    await writeProjectConfig(projectDir, {
      name: "project-test",
      skills: [{ id: "web-testing-cypress-e2e", scope: "global", origin: "eject" }],
      agents: [{ name: E2E_AGENT["api-developer"].name, scope: "project" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["api-developer"].name]: {
          "web-e2e": [{ id: "web-testing-cypress-e2e", preloaded: true }],
        },
      },
    });

    const { exitCode } = await CLI.run(
      ["compile"],
      { dir: projectDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      contains: ["web-testing-cypress-e2e"],
    });
  });
});
