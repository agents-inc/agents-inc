import path from "path";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  ensureBinaryExists,
  readCompiledAgents,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
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

      // Each scope is compiled by a run in that scope: a compile inside a project
      // writes only that project, so the global agents are the home run's to write.
      const globalRun = await CLI.run(
        ["compile"],
        { dir: globalHome.dir },
        { env: { HOME: globalHome.dir } },
      );
      expect(globalRun.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(globalRun.output).toContain("Compiling global agents");

      const { exitCode, output } = await CLI.run(["compile"], project, {
        env: { HOME: globalHome.dir },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
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

      // Ported from the deleted "should not produce duplicate agent files across
      // scopes": the per-agent matchers above negate only the two names they are
      // given, so the directory listing is what forbids a third file appearing in
      // either scope.
      expect(Object.keys(await readCompiledAgents(globalHome.dir))).toStrictEqual([
        `${E2E_AGENT["web-developer"].name}.md`,
      ]);
      expect(Object.keys(await readCompiledAgents(project.dir))).toStrictEqual([
        `${E2E_AGENT["api-developer"].name}.md`,
      ]);
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
        selectedDomains: ["web"],
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
        selectedDomains: ["web"],
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

      const globalRun = await CLI.run(
        ["compile"],
        { dir: globalHome },
        { env: { HOME: globalHome } },
      );
      expect(globalRun.exitCode).toBe(EXIT_CODES.SUCCESS);

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
    // One spec, the harder of the two setups. A sibling used the same fixture with
    // the global skill ALSO listed in the project config's `skills` array; that is
    // strictly easier — if discovery works without the listing it works with it —
    // and its unique claim (the project agent carries the project-local skill too)
    // is ported here by naming both skills in the project stack.
    it("should discover global local skills the project config does not list, alongside its own", async () => {
      const { project, globalHome } = await ProjectBuilder.dualScope({
        globalSkill: {
          description: "Global skill for project discovery",
          metadata: renderMetadataYaml({ contentHash: "hash-gpd" }),
        },
        // Only the project-scoped skill is registered here — the global one is
        // referenced by the stack below and by nothing else.
        projectSkills: [{ id: "web-testing-playwright-e2e", scope: "project", source: "eject" }],
        projectStack: {
          "web-testing": [
            { id: "web-testing-cypress-e2e", preloaded: true },
            { id: "web-testing-playwright-e2e", preloaded: true },
          ],
        },
        projectSkill: {
          description: "Project-local skill for discovery test",
          metadata: renderMetadataYaml({ contentHash: "hash-ppd" }),
        },
      });
      tempDir = path.dirname(project.dir);

      const globalRun = await CLI.run(
        ["compile"],
        { dir: globalHome.dir },
        { env: { HOME: globalHome.dir } },
      );
      expect(globalRun.exitCode).toBe(EXIT_CODES.SUCCESS);

      const { exitCode } = await CLI.run(["compile"], project, {
        env: { HOME: globalHome.dir },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // The project agent carries BOTH the project-local skill and the global one
      // its config never names.
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
  });

  describe("project agents not clobbered by global pass", () => {
    it("should label each context's own pass in verbose mode", async () => {
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

      const globalRun = await CLI.run(
        ["compile", "--verbose"],
        { dir: globalHome.dir },
        { env: { HOME: globalHome.dir } },
      );

      expect(globalRun.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(globalRun.output).toContain("Compiling global agents");
      expect(globalRun.output).toContain("Global compile complete");
      expect(globalRun.output).toMatch(/\d+ global agents rewritten, \d+ unchanged/);
      expect(globalRun.output).not.toContain("Compiling project agents");

      const { exitCode, output } = await CLI.run(["compile", "--verbose"], project, {
        env: { HOME: globalHome.dir },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Compiling project agents");
      expect(output).toContain("Project compile complete");
      expect(output).toMatch(/\d+ project agents rewritten, \d+ unchanged/);
      expect(output, "a compile inside a project must not run the global pass").not.toContain(
        "Compiling global agents",
      );

      // Ported from the deleted dual-scope "should name the one pass each context
      // owns": not running the global PASS is not the same as not READING the
      // global scope. A project agent may carry a global-scoped skill, so the
      // project run still loads both scopes' skills — it is the writes that are
      // contained, and without this the negative above would also pass on a run
      // that had stopped reading ~/.claude/skills/ altogether.
      expect(output).toContain(STEP_TEXT.LOADED_SKILL);
      expect(output).toContain("web-testing-cypress-e2e");
      expect(output).toContain("web-testing-playwright-e2e");
    });
  });
});
