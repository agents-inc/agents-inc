import path from "path";
import { describe, it, expect, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  readCompiledAgents,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import { metadataFieldsFor, ProjectBuilder } from "../fixtures/project-builder.js";

/**
 * Each compile pass writes only its own scope's agents, and the project pass sees global local
 * skills.
 */
describe("compile scope filtering", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  describe("dual-pass scope filtering", () => {
    it("should not overwrite global agent with zero-skill version during project pass", async () => {
      // The project config lacks web-developer, so the project pass must not compile it.
      const { project, globalHome } = await ProjectBuilder.dualScope({
        globalSkill: {
          description: "Global skill for scope filtering test",
          metadata: renderMetadataYaml({
            ...metadataFieldsFor("web-testing-cypress-e2e"),
            contentHash: "hash-global-sf",
          }),
        },
        projectSkills: [
          { id: "web-mocks-msw", scope: "project", origin: "eject" },
          { id: "web-testing-cypress-e2e", scope: "global", origin: "eject" },
        ],
        projectStack: {
          "web-mocking": [{ id: "web-mocks-msw", preloaded: true }],
        },
        projectSkill: {
          description: "Project skill for scope filtering test",
          metadata: renderMetadataYaml({
            ...metadataFieldsFor("web-mocks-msw"),
            contentHash: "hash-project-sf",
          }),
        },
      });
      tempDir = path.dirname(project.dir);

      // A compile inside a project writes only that project, so the global agents need the home
      // run.
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

      await expect(globalHome).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
        contains: ["name: web-developer", "web-testing-cypress-e2e"],
      });

      await expect(globalHome).not.toHaveCompiledAgent(E2E_AGENT["api-developer"].name);

      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
        contains: ["name: api-developer", "web-mocks-msw"],
      });

      await expect(project).not.toHaveCompiledAgent(E2E_AGENT["web-developer"].name);

      // The per-agent matchers negate only the names given; the listing forbids a third file.
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

      await writeProjectConfig(globalHome, {
        name: "global-test",
        skills: [
          { id: "web-testing-cypress-e2e", scope: "global", origin: "eject" },
          { id: E2E_SKILL.react.id, scope: "global", origin: "eject" },
        ],
        agents: [
          { name: E2E_AGENT["web-developer"].name, scope: "global" },
          { name: E2E_AGENT["api-developer"].name, scope: "global" },
        ],
        selectedDomains: ["web"],
        stack: {
          [E2E_AGENT["web-developer"].name]: {
            "web-e2e": [{ id: "web-testing-cypress-e2e", preloaded: true }],
          },
          [E2E_AGENT["api-developer"].name]: {
            "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
          },
        },
      });

      await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
        description: "Global skill A",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor("web-testing-cypress-e2e"),
          contentHash: "hash-gA",
        }),
      });
      await createLocalSkill(globalHome, E2E_SKILL.react.id, {
        description: "Global skill B",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor(E2E_SKILL.react.id),
          contentHash: "hash-gB",
        }),
      });

      await writeProjectConfig(projectDir, {
        name: "project-test",
        skills: [{ id: "web-mocks-msw", scope: "project", origin: "eject" }],
        agents: [{ name: "cli-developer", scope: "project" }],
        selectedDomains: ["web"],
        stack: {
          "cli-developer": {
            "web-mocking": [{ id: "web-mocks-msw", preloaded: true }],
          },
        },
      });

      await createLocalSkill(projectDir, "web-mocks-msw", {
        description: "Project skill",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor("web-mocks-msw"),
          contentHash: "hash-pC",
        }),
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

      await expect({ dir: globalHome }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["name: web-developer", "web-testing-cypress-e2e"],
        },
      );

      await expect({ dir: globalHome }).toHaveCompiledAgentContent(
        E2E_AGENT["api-developer"].name,
        {
          contains: ["name: api-developer", E2E_SKILL.react.id],
        },
      );

      await expect({ dir: globalHome }).not.toHaveCompiledAgent("cli-developer");

      await expect({ dir: projectDir }).toHaveCompiledAgentContent("cli-developer", {
        contains: ["name: cli-developer", "web-mocks-msw"],
      });

      await expect({ dir: projectDir }).not.toHaveCompiledAgent(E2E_AGENT["web-developer"].name);
      await expect({ dir: projectDir }).not.toHaveCompiledAgent(E2E_AGENT["api-developer"].name);
    });
  });

  describe("global skill discovery for project pass", () => {
    it("should discover global local skills the project config does not list, alongside its own", async () => {
      const { project, globalHome } = await ProjectBuilder.dualScope({
        globalSkill: {
          description: "Global skill for project discovery",
          metadata: renderMetadataYaml({
            ...metadataFieldsFor("web-testing-cypress-e2e"),
            contentHash: "hash-gpd",
          }),
        },
        // The global skill is referenced only by the stack below.
        projectSkills: [{ id: "web-mocks-msw", scope: "project", origin: "eject" }],
        // Keyed by the catalogue's category, not the id prefix: `web-testing-cypress-e2e` is
        // `web-e2e`, which is exclusive.
        projectStack: {
          "web-e2e": [{ id: "web-testing-cypress-e2e", preloaded: true }],
          "web-mocking": [{ id: "web-mocks-msw", preloaded: true }],
        },
        projectSkill: {
          description: "Project-local skill for discovery test",
          metadata: renderMetadataYaml({
            ...metadataFieldsFor("web-mocks-msw"),
            contentHash: "hash-ppd",
          }),
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

      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
        contains: ["name: api-developer", "web-mocks-msw", "web-testing-cypress-e2e"],
      });

      await expect(project).not.toHaveCompiledAgent(E2E_AGENT["web-developer"].name);

      await expect(globalHome).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
        contains: ["name: web-developer", "web-testing-cypress-e2e"],
      });

      await expect(globalHome).not.toHaveCompiledAgent(E2E_AGENT["api-developer"].name);
    });
  });

  describe("project agents not clobbered by global pass", () => {
    it("should label each context's own pass in verbose mode", async () => {
      const { project, globalHome } = await ProjectBuilder.dualScope({
        globalSkill: {
          description: "Global skill for verbose test",
          metadata: renderMetadataYaml({
            ...metadataFieldsFor("web-testing-cypress-e2e"),
            contentHash: "hash-gv",
          }),
        },
        projectSkills: [{ id: "web-mocks-msw", scope: "project", origin: "eject" }],
        projectStack: {
          "web-mocking": [{ id: "web-mocks-msw", preloaded: true }],
        },
        projectSkill: {
          description: "Project skill for verbose test",
          metadata: renderMetadataYaml({
            ...metadataFieldsFor("web-mocks-msw"),
            contentHash: "hash-pv",
          }),
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
      expect(globalRun.output).toMatch(/\d+ global agents? rewritten, \d+ unchanged/);
      expect(globalRun.output).not.toContain("Compiling project agents");

      const { exitCode, output } = await CLI.run(["compile", "--verbose"], project, {
        env: { HOME: globalHome.dir },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Compiling project agents");
      expect(output).toContain("Project compile complete");
      expect(output).toMatch(/\d+ project agents? rewritten, \d+ unchanged/);
      expect(output, "a compile inside a project must not run the global pass").not.toContain(
        "Compiling global agents",
      );

      // The project run still reads both scopes' skills; only writes are contained. Without this
      // the negative above would pass on a run that stopped reading ~/.claude/skills/.
      expect(output).toContain(STEP_TEXT.LOADED_SKILL);
      expect(output).toContain("web-testing-cypress-e2e");
      expect(output).toContain("web-mocks-msw");
    });
  });
});
