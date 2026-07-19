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
import { EXIT_CODES } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import type { SkillAssignment, SkillConfig } from "../../src/cli/types/index.js";

/** Standard global side: web-developer agent preloading web-testing-cypress-e2e. */
async function arrangeGlobalWebDeveloper(
  globalHome: string,
  options: { description: string; contentHash: string },
): Promise<void> {
  await writeProjectConfig(globalHome, {
    name: "global-test",
    skills: [{ id: "web-testing-cypress-e2e", scope: "global", source: "eject" }],
    agents: [{ name: "web-developer", scope: "global" }],
    domains: ["web"],
    stack: {
      "web-developer": {
        "web-testing": [{ id: "web-testing-cypress-e2e", preloaded: true }],
      },
    },
  });

  await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
    description: options.description,
    metadata: renderMetadataYaml({ contentHash: options.contentHash }),
  });
}

/** Standard project side: api-developer agent plus a local playwright skill. */
async function arrangeProjectApiDeveloper(
  projectDir: string,
  options: {
    skills: SkillConfig[];
    stackSkills: SkillAssignment[];
    description: string;
    contentHash: string;
  },
): Promise<void> {
  await writeProjectConfig(projectDir, {
    name: "project-test",
    skills: options.skills,
    agents: [{ name: "api-developer", scope: "project" }],
    domains: ["web"],
    stack: {
      "api-developer": {
        "web-testing": options.stackSkills,
      },
    },
  });

  await createLocalSkill(projectDir, "web-testing-playwright-e2e", {
    description: options.description,
    metadata: renderMetadataYaml({ contentHash: options.contentHash }),
  });
}

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
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "global-home");
      const projectDir = path.join(tempDir, "project");

      // Global installation: web-developer agent with a skill
      await arrangeGlobalWebDeveloper(globalHome, {
        description: "Global skill for scope filtering test",
        contentHash: "hash-global-sf",
      });

      // Project installation: api-developer agent with a different skill.
      // The project config does NOT have web-developer in its agents list,
      // but before the fix, the project pass would compile ALL agents from
      // the agent definitions source, including web-developer, with zero skills.
      await arrangeProjectApiDeveloper(projectDir, {
        skills: [
          { id: "web-testing-playwright-e2e", scope: "project", source: "eject" },
          { id: "web-testing-cypress-e2e", scope: "global", source: "eject" },
        ],
        stackSkills: [{ id: "web-testing-playwright-e2e", preloaded: true }],
        description: "Project skill for scope filtering test",
        contentHash: "hash-project-sf",
      });

      const { exitCode, output } = await CLI.run(
        ["compile"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Compiling global agents");
      expect(output).toContain("Compiling project agents");

      // Global agent should exist and contain its skill (not be clobbered)
      await expect({ dir: globalHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer", "web-testing-cypress-e2e"],
      });

      // Global dir should NOT have the project agent
      await expect({ dir: globalHome }).not.toHaveCompiledAgent("api-developer");

      // Project agent should exist and contain its skill
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["name: api-developer", "web-testing-playwright-e2e"],
      });

      // Project dir should NOT have the global agent
      await expect({ dir: projectDir }).not.toHaveCompiledAgent("web-developer");
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
          { name: "web-developer", scope: "global" },
          { name: "api-developer", scope: "global" },
        ],
        domains: ["web"],
        stack: {
          "web-developer": {
            "web-testing": [{ id: "web-testing-cypress-e2e", preloaded: true }],
          },
          "api-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        },
      });

      await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
        description: "Global skill A",
        metadata: `author: "@test"\ncontentHash: "hash-gA"\n`,
      });
      await createLocalSkill(globalHome, "web-framework-react", {
        description: "Global skill B",
        metadata: `author: "@test"\ncontentHash: "hash-gB"\n`,
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
        metadata: `author: "@test"\ncontentHash: "hash-pC"\n`,
      });

      const { exitCode } = await CLI.run(
        ["compile"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Both global agents should be compiled with their respective skills
      await expect({ dir: globalHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer", "web-testing-cypress-e2e"],
      });

      await expect({ dir: globalHome }).toHaveCompiledAgentContent("api-developer", {
        contains: ["name: api-developer", "web-framework-react"],
      });

      // Global dir should NOT have the project agent
      await expect({ dir: globalHome }).not.toHaveCompiledAgent("cli-developer");

      // Project agent compiled separately with its skill
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("cli-developer", {
        contains: ["name: cli-developer", "web-testing-playwright-e2e"],
      });

      // Project dir should NOT have any global agents
      await expect({ dir: projectDir }).not.toHaveCompiledAgent("web-developer");
      await expect({ dir: projectDir }).not.toHaveCompiledAgent("api-developer");
    });
  });

  describe("global skill discovery for project pass", () => {
    it("should make global local skills available to project agents", async () => {
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "global-home");
      const projectDir = path.join(tempDir, "project");

      // Global installation: one global skill
      await arrangeGlobalWebDeveloper(globalHome, {
        description: "Global local skill for discovery test",
        contentHash: "hash-gd",
      });

      // Project installation: project agent references the GLOBAL skill via stack.
      // Before the fix, the project pass only discovered project plugins,
      // so it couldn't find globally-installed local skills.
      await arrangeProjectApiDeveloper(projectDir, {
        skills: [
          { id: "web-testing-cypress-e2e", scope: "global", source: "eject" },
          { id: "web-testing-playwright-e2e", scope: "project", source: "eject" },
        ],
        stackSkills: [
          { id: "web-testing-cypress-e2e", preloaded: true },
          { id: "web-testing-playwright-e2e", preloaded: true },
        ],
        description: "Project-local skill for discovery test",
        contentHash: "hash-pd",
      });

      const { exitCode, output } = await CLI.run(
        ["compile", "--verbose"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Project agent should include both the project-local AND global-local skill
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["name: api-developer", "web-testing-playwright-e2e", "web-testing-cypress-e2e"],
      });

      // Project dir should NOT have the global agent
      await expect({ dir: projectDir }).not.toHaveCompiledAgent("web-developer");

      // Global agent should contain its own skill
      await expect({ dir: globalHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer", "web-testing-cypress-e2e"],
      });

      // Global dir should NOT have the project agent
      await expect({ dir: globalHome }).not.toHaveCompiledAgent("api-developer");
    });

    it("should discover global local skills even when project has no global-scoped skills in config", async () => {
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "global-home");
      const projectDir = path.join(tempDir, "project");

      // Global installation with a skill
      await arrangeGlobalWebDeveloper(globalHome, {
        description: "Global skill for project discovery",
        contentHash: "hash-gpd",
      });

      // Project installation: references the global skill in its stack
      // but only has project-scoped skills in config
      await arrangeProjectApiDeveloper(projectDir, {
        skills: [{ id: "web-testing-playwright-e2e", scope: "project", source: "eject" }],
        stackSkills: [{ id: "web-testing-cypress-e2e", preloaded: true }],
        description: "Project skill (not referenced in stack)",
        contentHash: "hash-ppd",
      });

      const { exitCode } = await CLI.run(
        ["compile"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // The project agent should include the global skill even though
      // the project config only has project-scoped skills
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["name: api-developer", "web-testing-cypress-e2e"],
      });

      // Project dir should NOT have the global agent
      await expect({ dir: projectDir }).not.toHaveCompiledAgent("web-developer");

      // Global agent should contain its own skill
      await expect({ dir: globalHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer", "web-testing-cypress-e2e"],
      });

      // Global dir should NOT have the project agent
      await expect({ dir: globalHome }).not.toHaveCompiledAgent("api-developer");
    });
  });

  describe("project agents not clobbered by global pass", () => {
    it("should compile project agents with their own skills, not zero-skill versions", async () => {
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "global-home");
      const projectDir = path.join(tempDir, "project");

      // Global installation: web-developer only
      await arrangeGlobalWebDeveloper(globalHome, {
        description: "Global skill",
        contentHash: "hash-g13",
      });

      // Project installation: api-developer with its own skill assignment
      await arrangeProjectApiDeveloper(projectDir, {
        skills: [
          { id: "web-testing-playwright-e2e", scope: "project", source: "eject" },
          { id: "web-testing-cypress-e2e", scope: "global", source: "eject" },
        ],
        stackSkills: [{ id: "web-testing-playwright-e2e", preloaded: true }],
        description: "Project skill for non-clobber test",
        contentHash: "hash-p13",
      });

      const { exitCode } = await CLI.run(
        ["compile"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Project agent should have its skill, not be empty/zero-skill
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["name: api-developer", "web-testing-playwright-e2e"],
      });

      // Project dir should NOT have the global agent
      await expect({ dir: projectDir }).not.toHaveCompiledAgent("web-developer");

      // Global agent should contain its own skill
      await expect({ dir: globalHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer", "web-testing-cypress-e2e"],
      });

      // Global dir should NOT have the project agent
      await expect({ dir: globalHome }).not.toHaveCompiledAgent("api-developer");
    });

    it("should not produce duplicate agent files across scopes", async () => {
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "global-home");
      const projectDir = path.join(tempDir, "project");

      // Global: web-developer
      await arrangeGlobalWebDeveloper(globalHome, {
        description: "Global skill for dedup test",
        contentHash: "hash-gdd",
      });

      // Project: api-developer
      await arrangeProjectApiDeveloper(projectDir, {
        skills: [
          { id: "web-testing-playwright-e2e", scope: "project", source: "eject" },
          { id: "web-testing-cypress-e2e", scope: "global", source: "eject" },
        ],
        stackSkills: [{ id: "web-testing-playwright-e2e", preloaded: true }],
        description: "Project skill for dedup test",
        contentHash: "hash-pdd",
      });

      const { exitCode } = await CLI.run(
        ["compile"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // web-developer should ONLY be in global dir, NOT in project dir
      const globalAgents = await listFiles(agentsPath(globalHome));
      const projectAgents = await listFiles(agentsPath(projectDir));

      const globalMdFiles = globalAgents.filter((f) => f.endsWith(".md"));
      const projectMdFiles = projectAgents.filter((f) => f.endsWith(".md"));

      expect(globalMdFiles).toContain("web-developer.md");
      expect(globalMdFiles).not.toContain("api-developer.md");

      expect(projectMdFiles).toContain("api-developer.md");
      expect(projectMdFiles).not.toContain("web-developer.md");
    });

    it("should output correct pass labels in verbose mode", async () => {
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "global-home");
      const projectDir = path.join(tempDir, "project");

      // Global: web-developer
      await arrangeGlobalWebDeveloper(globalHome, {
        description: "Global skill for verbose test",
        contentHash: "hash-gv",
      });

      // Project: api-developer
      await arrangeProjectApiDeveloper(projectDir, {
        skills: [{ id: "web-testing-playwright-e2e", scope: "project", source: "eject" }],
        stackSkills: [{ id: "web-testing-playwright-e2e", preloaded: true }],
        description: "Project skill for verbose test",
        contentHash: "hash-pv",
      });

      const { exitCode, output } = await CLI.run(
        ["compile", "--verbose"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

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
