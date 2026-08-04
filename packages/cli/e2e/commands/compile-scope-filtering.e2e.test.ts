import path from "path";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  ensureBinaryExists,
  listFiles,
  agentsPath,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { EXIT_CODES } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";

/**
 * Regression tests for compile scope-filtering fixes.
 *
 * Dual-pass scope filtering — project pass must NOT overwrite global agents.
 * Global skill discovery — project pass must see global local skills.
 * Filtered agents per pass — each pass only compiles its own scope's agents.
 */
describe("compile scope filtering", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  describe("dual-pass scope filtering", () => {
    it("should not overwrite global agent with zero-skill version during project pass", async () => {
      // Global installation: web-developer agent with a skill.
      // Project installation: api-developer agent with a different skill.
      // The project config does NOT have web-developer in its agents list,
      // but before the fix, the project pass would compile ALL agents from
      // the agent definitions source, including web-developer, with zero skills.
      const { project, globalHome } = await ProjectBuilder.dualScope({
        globalSkill: {
          description: "Global skill for scope filtering test",
          metadata: renderMetadataYaml({ contentHash: "hash-global-sf" }),
        },
        projectSkills: [
          { id: "web-testing-playwright-e2e", scope: "project", source: "eject" },
          { id: "web-testing-cypress-e2e", scope: "global", source: "eject" },
        ],
        projectStack: {
          "web-testing": [{ id: "web-testing-playwright-e2e", preloaded: true }],
        },
        projectSkill: {
          description: "Project skill for scope filtering test",
          metadata: renderMetadataYaml({ contentHash: "hash-project-sf" }),
        },
      });
      tempDir = path.dirname(project.dir);

      const { exitCode, output } = await CLI.run(["compile"], project, {
        env: { HOME: globalHome.dir },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Compiling global agents");
      expect(output).toContain("Compiling project agents");

      // Global agent should exist and contain its skill (not be clobbered)
      await expect(globalHome).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
        contains: ["name: web-developer", "web-testing-cypress-e2e"],
      });

      // Global dir should NOT have the project agent
      await expect(globalHome).not.toHaveCompiledAgent(E2E_AGENT["api-developer"].name);

      // Project agent should exist and contain its skill
      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
        contains: ["name: api-developer", "web-testing-playwright-e2e"],
      });

      // Project dir should NOT have the global agent
      await expect(project).not.toHaveCompiledAgent(E2E_AGENT["web-developer"].name);
    });

    it("should compile global agent with skills even when project config has no stack entry for it", async () => {
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "global-home");
      const projectDir = path.join(tempDir, "project");

      // Global installation: two agents, each with a skill
      await writeProjectConfig(globalHome, {
        name: "global-test",
        skills: [
          { id: "web-testing-cypress-e2e", scope: "global", source: "eject" },
          { id: "web-framework-react", scope: "global", source: "eject" },
        ],
        agents: [
          { name: E2E_AGENT["web-developer"].name, scope: "global" },
          { name: E2E_AGENT["api-developer"].name, scope: "global" },
        ],
        domains: ["web"],
        stack: {
          [E2E_AGENT["web-developer"].name]: {
            "web-testing": [{ id: "web-testing-cypress-e2e", preloaded: true }],
          },
          [E2E_AGENT["api-developer"].name]: {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        },
      });

      await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
        description: "Global skill A",
        metadata: renderMetadataYaml({ contentHash: "hash-gA" }),
      });
      await createLocalSkill(globalHome, "web-framework-react", {
        description: "Global skill B",
        metadata: renderMetadataYaml({ contentHash: "hash-gB" }),
      });

      // Project installation: completely different agent, no overlap with global
      await writeProjectConfig(projectDir, {
        name: "project-test",
        skills: [{ id: "web-testing-playwright-e2e", scope: "project", source: "eject" }],
        agents: [{ name: "cli-developer", scope: "project" }],
        domains: ["web"],
        stack: {
          "cli-developer": {
            "web-testing": [{ id: "web-testing-playwright-e2e", preloaded: true }],
          },
        },
      });

      await createLocalSkill(projectDir, "web-testing-playwright-e2e", {
        description: "Project skill",
        metadata: renderMetadataYaml({ contentHash: "hash-pC" }),
      });

      const { exitCode } = await CLI.run(
        ["compile"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Both global agents should be compiled with their respective skills
      await expect({ dir: globalHome }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["name: web-developer", "web-testing-cypress-e2e"],
        },
      );

      await expect({ dir: globalHome }).toHaveCompiledAgentContent(
        E2E_AGENT["api-developer"].name,
        {
          contains: ["name: api-developer", "web-framework-react"],
        },
      );

      // Global dir should NOT have the project agent
      await expect({ dir: globalHome }).not.toHaveCompiledAgent("cli-developer");

      // Project agent compiled separately with its skill
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("cli-developer", {
        contains: ["name: cli-developer", "web-testing-playwright-e2e"],
      });

      // Project dir should NOT have any global agents
      await expect({ dir: projectDir }).not.toHaveCompiledAgent(E2E_AGENT["web-developer"].name);
      await expect({ dir: projectDir }).not.toHaveCompiledAgent(E2E_AGENT["api-developer"].name);
    });
  });

  describe("global skill discovery for project pass", () => {
    it("should make global local skills available to project agents", async () => {
      // Global installation: one global skill.
      // Project installation: project agent references the GLOBAL skill via stack.
      // Before the fix, the project pass only discovered project plugins,
      // so it couldn't find globally-installed local skills.
      const { project, globalHome } = await ProjectBuilder.dualScope({
        globalSkill: {
          description: "Global local skill for discovery test",
          metadata: renderMetadataYaml({ contentHash: "hash-gd" }),
        },
        projectSkills: [
          { id: "web-testing-cypress-e2e", scope: "global", source: "eject" },
          { id: "web-testing-playwright-e2e", scope: "project", source: "eject" },
        ],
        projectStack: {
          "web-testing": [
            { id: "web-testing-cypress-e2e", preloaded: true },
            { id: "web-testing-playwright-e2e", preloaded: true },
          ],
        },
        projectSkill: {
          description: "Project-local skill for discovery test",
          metadata: renderMetadataYaml({ contentHash: "hash-pd" }),
        },
      });
      tempDir = path.dirname(project.dir);

      const { exitCode } = await CLI.run(["compile", "--verbose"], project, {
        env: { HOME: globalHome.dir },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Project agent should include both the project-local AND global-local skill
      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
        contains: ["name: api-developer", "web-testing-playwright-e2e", "web-testing-cypress-e2e"],
      });

      // Project dir should NOT have the global agent
      await expect(project).not.toHaveCompiledAgent(E2E_AGENT["web-developer"].name);

      // Global agent should contain its own skill
      await expect(globalHome).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
        contains: ["name: web-developer", "web-testing-cypress-e2e"],
      });

      // Global dir should NOT have the project agent
      await expect(globalHome).not.toHaveCompiledAgent(E2E_AGENT["api-developer"].name);
    });

    it("should discover global local skills even when project has no global-scoped skills in config", async () => {
      // Global installation with a skill.
      // Project installation: references the global skill in its stack
      // but only has project-scoped skills in config.
      const { project, globalHome } = await ProjectBuilder.dualScope({
        globalSkill: {
          description: "Global skill for project discovery",
          metadata: renderMetadataYaml({ contentHash: "hash-gpd" }),
        },
        projectSkills: [{ id: "web-testing-playwright-e2e", scope: "project", source: "eject" }],
        projectStack: {
          "web-testing": [{ id: "web-testing-cypress-e2e", preloaded: true }],
        },
        projectSkill: {
          description: "Project skill (not referenced in stack)",
          metadata: renderMetadataYaml({ contentHash: "hash-ppd" }),
        },
      });
      tempDir = path.dirname(project.dir);

      const { exitCode } = await CLI.run(["compile"], project, {
        env: { HOME: globalHome.dir },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // The project agent should include the global skill even though
      // the project config only has project-scoped skills
      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
        contains: ["name: api-developer", "web-testing-cypress-e2e"],
      });

      // Project dir should NOT have the global agent
      await expect(project).not.toHaveCompiledAgent(E2E_AGENT["web-developer"].name);

      // Global agent should contain its own skill
      await expect(globalHome).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
        contains: ["name: web-developer", "web-testing-cypress-e2e"],
      });

      // Global dir should NOT have the project agent
      await expect(globalHome).not.toHaveCompiledAgent(E2E_AGENT["api-developer"].name);
    });
  });

  describe("project agents not clobbered by global pass", () => {
    it("should compile project agents with their own skills, not zero-skill versions", async () => {
      // Global installation: web-developer only.
      // Project installation: api-developer with its own skill assignment.
      const { project, globalHome } = await ProjectBuilder.dualScope({
        globalSkill: {
          description: "Global skill",
          metadata: renderMetadataYaml({ contentHash: "hash-g13" }),
        },
        projectSkills: [
          { id: "web-testing-playwright-e2e", scope: "project", source: "eject" },
          { id: "web-testing-cypress-e2e", scope: "global", source: "eject" },
        ],
        projectStack: {
          "web-testing": [{ id: "web-testing-playwright-e2e", preloaded: true }],
        },
        projectSkill: {
          description: "Project skill for non-clobber test",
          metadata: renderMetadataYaml({ contentHash: "hash-p13" }),
        },
      });
      tempDir = path.dirname(project.dir);

      const { exitCode } = await CLI.run(["compile"], project, {
        env: { HOME: globalHome.dir },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Project agent should have its skill, not be empty/zero-skill
      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
        contains: ["name: api-developer", "web-testing-playwright-e2e"],
      });

      // Project dir should NOT have the global agent
      await expect(project).not.toHaveCompiledAgent(E2E_AGENT["web-developer"].name);

      // Global agent should contain its own skill
      await expect(globalHome).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
        contains: ["name: web-developer", "web-testing-cypress-e2e"],
      });

      // Global dir should NOT have the project agent
      await expect(globalHome).not.toHaveCompiledAgent(E2E_AGENT["api-developer"].name);
    });

    it("should not produce duplicate agent files across scopes", async () => {
      // Global: web-developer. Project: api-developer.
      const { project, globalHome } = await ProjectBuilder.dualScope({
        globalSkill: {
          description: "Global skill for dedup test",
          metadata: renderMetadataYaml({ contentHash: "hash-gdd" }),
        },
        projectSkills: [
          { id: "web-testing-playwright-e2e", scope: "project", source: "eject" },
          { id: "web-testing-cypress-e2e", scope: "global", source: "eject" },
        ],
        projectStack: {
          "web-testing": [{ id: "web-testing-playwright-e2e", preloaded: true }],
        },
        projectSkill: {
          description: "Project skill for dedup test",
          metadata: renderMetadataYaml({ contentHash: "hash-pdd" }),
        },
      });
      tempDir = path.dirname(project.dir);

      const { exitCode } = await CLI.run(["compile"], project, {
        env: { HOME: globalHome.dir },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // web-developer should ONLY be in global dir, NOT in project dir
      const globalAgents = await listFiles(agentsPath(globalHome.dir));
      const projectAgents = await listFiles(agentsPath(project.dir));

      const globalMdFiles = globalAgents.filter((f) => f.endsWith(".md"));
      const projectMdFiles = projectAgents.filter((f) => f.endsWith(".md"));

      expect(globalMdFiles).toContain("web-developer.md");
      expect(globalMdFiles).not.toContain("api-developer.md");

      expect(projectMdFiles).toContain("api-developer.md");
      expect(projectMdFiles).not.toContain("web-developer.md");
    });

    it("should output correct pass labels in verbose mode", async () => {
      // Global: web-developer. Project: api-developer.
      const { project, globalHome } = await ProjectBuilder.dualScope({
        globalSkill: {
          description: "Global skill for verbose test",
          metadata: renderMetadataYaml({ contentHash: "hash-gv" }),
        },
        projectSkills: [{ id: "web-testing-playwright-e2e", scope: "project", source: "eject" }],
        projectStack: {
          "web-testing": [{ id: "web-testing-playwright-e2e", preloaded: true }],
        },
        projectSkill: {
          description: "Project skill for verbose test",
          metadata: renderMetadataYaml({ contentHash: "hash-pv" }),
        },
      });
      tempDir = path.dirname(project.dir);

      const { exitCode, output } = await CLI.run(["compile", "--verbose"], project, {
        env: { HOME: globalHome.dir },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Both passes should be labeled
      expect(output).toContain("Compiling global agents");
      expect(output).toContain("Compiling project agents");
      expect(output).toContain("Global compile complete");
      expect(output).toContain("Project compile complete");

      // Each pass should report recompiled agents
      expect(output).toMatch(/Recompiled \d+ global agents/);
      expect(output).toMatch(/Recompiled \d+ project agents/);
    });
  });
});
