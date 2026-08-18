import path from "path";
import { mkdir } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  directoryExists,
  ensureBinaryExists,
  listFiles,
  agentsPath,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";

describe("dual-scope compile", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should compile global agents referencing only global skills", async () => {
    const { project, globalHome } = await ProjectBuilder.dualScope();
    tempDir = path.dirname(project.dir);

    // The global agents belong to the home-context run; the project run below
    // must leave them exactly as that one wrote them.
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
        notContains: ["web-testing-playwright-e2e"],
      },
    );

    // Global agent should NOT contain project-scoped skill
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
      contains: ["web-testing-playwright-e2e", "web-testing-cypress-e2e"],
    });

    // Project agent should NOT contain web-only skills (different domain)
    await expect({ dir: project.dir }).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      notContains: [E2E_SKILL.react.id],
    });
  });

  it("should work with global-only installation", async () => {
    tempDir = await createTempDir();

    // Only global home has a config — project dir is bare
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
          "web-testing": [{ id: "web-testing-cypress-e2e", preloaded: true }],
        },
      },
    });

    await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
      description: "Global skill for single-scope test",
      metadata: renderMetadataYaml({ contentHash: "hash-global" }),
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

    // Fake HOME has no .claude-src/ — only project dir has config
    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");
    await mkdir(globalHome, { recursive: true });

    await writeProjectConfig(projectDir, {
      name: "project-test",
      skills: [{ id: "web-testing-playwright-e2e", scope: "project", origin: "eject" }],
      agents: [{ name: E2E_AGENT["api-developer"].name, scope: "project" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["api-developer"].name]: {
          "web-testing": [{ id: "web-testing-playwright-e2e", preloaded: true }],
        },
      },
    });

    await createLocalSkill(projectDir, "web-testing-playwright-e2e", {
      description: "Project skill for single-scope test",
      metadata: renderMetadataYaml({ contentHash: "hash-local" }),
    });

    const { exitCode } = await CLI.run(
      ["compile"],
      { dir: projectDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: projectDir }).toHaveCompiledAgent(E2E_AGENT["api-developer"].name);

    // The global agents directory is now always created (ensureDir is unconditional),
    // but for a project-only install no agent .md files should be written there.
    const globalAgentFiles = await listFiles(agentsPath(globalHome));
    const globalMdFiles = globalAgentFiles.filter((f) => f.endsWith(".md"));
    expect(globalMdFiles.length).toBe(0);
  });

  // Kept rather than folded into `compile-scope-filtering`'s global-skill-discovery
  // spec, which the audit named as covering it: that fixture gives the project its
  // OWN local skills, so it never exercises a project whose skills directory is
  // empty. Same claim, different path into the loader.
  it("should include global-only skills in project agent when project has no local skills", async () => {
    tempDir = await createTempDir();

    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");

    // Global installation: one global skill
    await writeProjectConfig(globalHome, {
      name: "global-test",
      skills: [{ id: "web-testing-cypress-e2e", scope: "global", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["web-developer"].name]: {
          "web-testing": [{ id: "web-testing-cypress-e2e", preloaded: true }],
        },
      },
    });

    await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
      description: "Global skill for cross-scope test",
      metadata: renderMetadataYaml({ contentHash: "hash-global" }),
    });

    // Project installation: agent references the global skill but has NO local skills
    await writeProjectConfig(projectDir, {
      name: "project-test",
      skills: [{ id: "web-testing-cypress-e2e", scope: "global", origin: "eject" }],
      agents: [{ name: E2E_AGENT["api-developer"].name, scope: "project" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["api-developer"].name]: {
          "web-testing": [{ id: "web-testing-cypress-e2e", preloaded: true }],
        },
      },
    });

    const { exitCode } = await CLI.run(
      ["compile"],
      { dir: projectDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // The project agent must contain the global skill even though the project
    // directory has no local skills — the compiler must discover ~/.claude/skills/.
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      contains: ["web-testing-cypress-e2e"],
    });
  });
});
