import os from "os";
import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeConfigs, mergeWithExistingConfig } from "./config-merger";
import type { ProjectConfig, SkillAssignment, SkillId } from "../../types";
import { CLAUDE_SRC_DIR, DEFAULT_PLUGIN_NAME, STANDARD_FILES } from "../../consts";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation.js";
import {
  buildProjectConfig,
  buildAgentConfigs,
  buildSourceConfig,
} from "../__tests__/factories/config-factories.js";
import { expectAgentConfigs } from "../__tests__/assertions/index.js";
import { firstElement } from "../__tests__/helpers/element-at.js";

describe("config-merger", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-config-merger-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("mergeWithExistingConfig", () => {
    async function writeFullConfig(config: ProjectConfig): Promise<void> {
      // Boundary cast: ProjectConfig to generic record for writeTestTsConfig
      await writeTestTsConfig(tempDir, config);
    }

    it("should return new config unchanged when no existing config exists", async () => {
      const newConfig = buildProjectConfig({
        name: "new-project",
        skills: [],
        description: "A new project",
      });

      const result = await mergeWithExistingConfig(newConfig, {
        projectDir: tempDir,
      });

      expect(result.merged).toBe(false);
      expect(result.config).toStrictEqual(newConfig);
      expect(result.existingConfigPath).toBeUndefined();
    });

    it("should inherit author from simple project config when no full config exists", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          marketplace: "github:my-org/skills",
          author: "@vince",
        }),
      );

      const newConfig = buildProjectConfig({ name: "new-project", skills: [] });

      const result = await mergeWithExistingConfig(newConfig, {
        projectDir: tempDir,
      });

      // loadFullProjectConfig finds the config, so merged is true
      expect(result.merged).toBe(true);
      // Author should be inherited from existing
      expect(result.config.author).toBe("@vince");
    });

    it("should inherit agentsSource from existing config", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          marketplace: "github:my-org/skills",
          agentsSource: "github:my-org/agents",
        }),
      );

      const newConfig = buildProjectConfig({ name: "new-project", skills: [] });

      const result = await mergeWithExistingConfig(newConfig, {
        projectDir: tempDir,
      });

      expect(result.merged).toBe(true);
      expect(result.config.agentsSource).toBe("github:my-org/agents");
    });

    it("drops a fully-deselected dual-scope agent's project entry and tombstone from the written config", async () => {
      await writeFullConfig(
        buildProjectConfig({
          name: "project",
          agents: [
            ...buildAgentConfigs(["api-developer"], { scope: "project" }),
            ...buildAgentConfigs(["api-developer"], { scope: "global", excluded: true }),
          ],
          skills: [],
        }),
      );

      // Wizard result after a full deselect: zero entries for api-developer.
      const newConfig = buildProjectConfig({ name: "project", agents: [], skills: [] });

      const result = await mergeWithExistingConfig(newConfig, { projectDir: tempDir });

      expect(result.merged).toBe(true);
      expect(result.config.agents.filter((a) => a.name === "api-developer")).toStrictEqual([]);
    });

    it("drops a fully-deselected dual-scope skill's project entry and tombstone from the written config", async () => {
      await writeFullConfig(
        buildProjectConfig({
          name: "project",
          skills: [
            ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
            ...buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              origin: "agents-inc",
              excluded: true,
            }),
          ],
        }),
      );

      const newConfig = buildProjectConfig({ name: "project", skills: [] });

      const result = await mergeWithExistingConfig(newConfig, { projectDir: tempDir });

      expect(result.merged).toBe(true);
      expect(result.config.skills.filter((s) => s.id === "web-framework-react")).toStrictEqual([]);
    });

    /**
     * `mergeWithExistingConfig` loads through `loadProjectConfig`, which falls back to
     * `os.homedir()` when the project carries no config of its own — so on a first save
     * into a project that sits under an existing global install, the "existing" config
     * the merge reconciles against IS the global one. Its `name` names the global
     * installation, never this directory, and a project config that adopts it claims an
     * identity that belongs to another file.
     *
     * `os.homedir()` is spied rather than `process.env.HOME` set: the loader's fallback
     * and `isHomeDirectory` both read the OS-level home, which ignores the environment
     * (see helpers/isolated-home.ts).
     */
    describe("a project with no config of its own, under a global install", () => {
      let projectDir: string;
      let fakeHome: string;

      beforeEach(async () => {
        fakeHome = path.join(tempDir, "fakehome");
        projectDir = path.join(tempDir, "acme-web");
        await mkdir(fakeHome, { recursive: true });
        await mkdir(projectDir, { recursive: true });
        vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      /** The identity `configNameFor` seeds a global install with. */
      const GLOBAL_INSTALL_NAME = DEFAULT_PLUGIN_NAME;
      /** The identity `configNameFor` seeds this project with — its own directory name. */
      const PROJECT_NAME = "acme-web";

      it("keeps the project's own name rather than the global config's", async () => {
        await writeTestTsConfig(
          fakeHome,
          buildProjectConfig({ name: GLOBAL_INSTALL_NAME, skills: [] }),
        );

        const result = await mergeWithExistingConfig(
          buildProjectConfig({ name: PROJECT_NAME, skills: [] }),
          { projectDir },
        );

        expect(result.config.name).toBe(PROJECT_NAME);
      });

      it("keeps the project's own name whatever the global config is called", async () => {
        await writeTestTsConfig(
          fakeHome,
          buildProjectConfig({ name: "a-name-no-guard-keys-on", skills: [] }),
        );

        const result = await mergeWithExistingConfig(
          buildProjectConfig({ name: PROJECT_NAME, skills: [] }),
          { projectDir },
        );

        expect(result.config.name).toBe(PROJECT_NAME);
      });

      it("still adopts the name recorded in the project's OWN config when it has one", async () => {
        await writeTestTsConfig(
          fakeHome,
          buildProjectConfig({ name: GLOBAL_INSTALL_NAME, skills: [] }),
        );
        await writeTestTsConfig(
          projectDir,
          buildProjectConfig({ name: "renamed-by-hand", skills: [] }),
        );

        const result = await mergeWithExistingConfig(
          buildProjectConfig({ name: PROJECT_NAME, skills: [] }),
          { projectDir },
        );

        expect(result.config.name).toBe("renamed-by-hand");
      });
    });

    describe("merge precedence rules", () => {
      it.each([
        { field: "name" as const, existingValue: "existing-project", newValue: "new-project" },
        {
          field: "description" as const,
          existingValue: "Existing description",
          newValue: "New description",
        },
        { field: "author" as const, existingValue: "@existing-author", newValue: "@new-author" },
        {
          field: "marketplaceName" as const,
          existingValue: "existing-marketplace",
          newValue: "new-marketplace",
        },
      ])(
        "should keep existing $field over new $field",
        async ({ field, existingValue, newValue }) => {
          await writeFullConfig(
            buildProjectConfig({ name: "project", skills: [], [field]: existingValue }),
          );

          const newConfig = buildProjectConfig({
            name: "project",
            skills: [],
            [field]: newValue,
          });

          const result = await mergeWithExistingConfig(newConfig, {
            projectDir: tempDir,
          });

          expect(result.merged).toBe(true);
          expect(result.config[field]).toBe(existingValue);
        },
      );

      it("should keep new source when sourceFlag is provided (new source takes precedence)", async () => {
        await writeFullConfig(
          buildProjectConfig({
            name: "project",
            skills: [],
            marketplace: "github:existing/source",
          }),
        );

        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
          marketplace: "github:new/source",
        });

        const result = await mergeWithExistingConfig(newConfig, {
          projectDir: tempDir,
        });

        expect(result.merged).toBe(true);
        expect(result.config.marketplace).toBe("github:new/source");
      });

      it("should keep existing source when new config has no source", async () => {
        await writeFullConfig(
          buildProjectConfig({
            name: "project",
            skills: [],
            marketplace: "github:existing/source",
          }),
        );

        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
        });

        const result = await mergeWithExistingConfig(newConfig, {
          projectDir: tempDir,
        });

        expect(result.merged).toBe(true);
        expect(result.config.marketplace).toBe("github:existing/source");
      });
    });

    describe("union of agents arrays", () => {
      it("should union agents (existing + new, deduplicated)", async () => {
        await writeFullConfig(
          buildProjectConfig({
            name: "project",
            agents: buildAgentConfigs(["web-developer", "api-developer"]),
            skills: [],
          }),
        );

        const newConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["web-developer", "cli-developer"]), // web-developer is duplicate
          skills: [],
        });

        const result = await mergeWithExistingConfig(newConfig, {
          projectDir: tempDir,
        });

        expect(result.merged).toBe(true);
        expectAgentConfigs(
          result.config,
          buildAgentConfigs(["web-developer", "api-developer", "cli-developer"]),
        );
      });

      it("should use new config agents if existing has empty agents", async () => {
        await writeFullConfig(buildProjectConfig({ name: "project", agents: [], skills: [] }));

        const newConfig = buildProjectConfig({ name: "project", skills: [] });

        const result = await mergeWithExistingConfig(newConfig, {
          projectDir: tempDir,
        });

        expect(result.merged).toBe(true);
        // Empty existing agents, so new agents are used
        expectAgentConfigs(result.config, buildAgentConfigs(["web-developer"]));
      });
    });

    describe("stack merge — new wins (mutator output is authoritative)", () => {
      /** Shorthand: creates a SkillAssignment[] from an id */
      function sa(id: string): SkillAssignment[] {
        return [{ id: id as SkillId, preloaded: false }];
      }

      it("should replace existing stack with new stack (mutator folds existing in)", async () => {
        await writeFullConfig(
          buildProjectConfig({
            name: "project",
            skills: [],
            stack: {
              "web-developer": {
                "web-framework": sa("web-framework-react-existing"),
                "web-styling": sa("web-styling-scss-existing"),
              },
            },
          }),
        );

        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
          stack: {
            "web-developer": {
              "web-framework": sa("web-framework-react-new"),
              "web-client-state": sa("web-state-zustand-new"),
            },
          },
        });

        const result = await mergeWithExistingConfig(newConfig, {
          projectDir: tempDir,
        });

        expect(result.merged).toBe(true);
        expect(result.config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": sa("web-framework-react-new"),
            "web-client-state": sa("web-state-zustand-new"),
          },
        });
      });

      it("should replace existing stack agents with new stack agents", async () => {
        await writeFullConfig(
          buildProjectConfig({
            name: "project",
            skills: [],
            stack: {
              "web-developer": {
                "web-framework": sa("web-framework-react"),
              },
            },
          }),
        );

        const newConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["web-developer", "api-developer"]),
          skills: [],
          stack: {
            "web-developer": {
              "web-framework": sa("web-framework-vue"),
            },
            "api-developer": {
              "api-api": sa("api-framework-hono"),
            },
          },
        });

        const result = await mergeWithExistingConfig(newConfig, {
          projectDir: tempDir,
        });

        expect(result.merged).toBe(true);
        expect(result.config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": sa("web-framework-vue"),
          },
          "api-developer": {
            "api-api": sa("api-framework-hono"),
          },
        });
      });

      it("should use new config stack if existing has no stack", async () => {
        await writeFullConfig(buildProjectConfig({ name: "project", skills: [] }));

        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
          stack: {
            "web-developer": {
              "web-framework": sa("web-framework-react"),
            },
          },
        });

        const result = await mergeWithExistingConfig(newConfig, {
          projectDir: tempDir,
        });

        expect(result.merged).toBe(true);
        expect(result.config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": sa("web-framework-react"),
          },
        });
      });
    });

    it("should not mutate the input config", async () => {
      await writeTestTsConfig(
        tempDir,
        buildProjectConfig({
          name: "existing",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
          author: "@existing",
        }),
      );

      const newConfig = buildProjectConfig({
        name: "new-project",
        agents: buildAgentConfigs(["api-developer"]),
        skills: [],
      });

      await mergeWithExistingConfig(newConfig, { projectDir: tempDir });

      // Original input should be unchanged
      expect(newConfig.name).toBe("new-project");
      expectAgentConfigs(newConfig, buildAgentConfigs(["api-developer"]));
      expect(newConfig.author).toBeUndefined();
    });

    it("should return existingConfigPath when merged", async () => {
      await writeTestTsConfig(
        tempDir,
        buildProjectConfig({
          name: "existing",
          agents: buildAgentConfigs(["web-developer"]),
        }),
      );

      const newConfig = buildProjectConfig({ name: "new-project", skills: [] });

      const result = await mergeWithExistingConfig(newConfig, {
        projectDir: tempDir,
      });

      expect(result.merged).toBe(true);
      expect(result.existingConfigPath).toContain(`${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}`);
    });
  });

  describe("mergeConfigs", () => {
    /** Shorthand: creates a SkillAssignment[] from an id */
    function sa(id: string): SkillAssignment[] {
      return [{ id: id as SkillId, preloaded: false }];
    }

    describe("identity fields — existing takes precedence", () => {
      it("should use existing name when present", () => {
        const newConfig = buildProjectConfig({ name: "new-name", skills: [] });
        const existingConfig = buildProjectConfig({ name: "existing-name", skills: [] });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "existing-name",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
        });
      });

      it("should use existing description when present", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
          description: "New description",
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
          description: "Existing description",
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          description: "Existing description",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
        });
      });

      it("should use new source when both configs have source (sourceFlag takes precedence)", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
          marketplace: "github:new/source",
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
          marketplace: "github:existing/source",
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          marketplace: "github:new/source",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
        });
      });

      it("should use existing source when new config has no source", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
          marketplace: "github:existing/source",
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          marketplace: "github:existing/source",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
        });
      });

      it("should use existing author when present", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
          author: "@new-author",
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
          author: "@existing-author",
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          author: "@existing-author",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
        });
      });

      it("should use existing marketplace name when present", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
          marketplaceName: "new-marketplace",
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
          marketplaceName: "existing-marketplace",
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          marketplaceName: "existing-marketplace",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
        });
      });

      it("should use existing agentsSource when present", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
          agentsSource: "github:new/agents",
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
          agentsSource: "github:existing/agents",
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          agentsSource: "github:existing/agents",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
        });
      });

      it("should keep new values when existing fields are absent", () => {
        const newConfig = buildProjectConfig({
          name: "new-name",
          skills: [],
          description: "New desc",
          author: "@new",
        });
        const existingConfig = buildProjectConfig({ name: "", skills: [] });

        const result = mergeConfigs(newConfig, existingConfig);

        // Empty string is falsy, so new values are kept
        expect(result).toStrictEqual({
          name: "new-name",
          description: "New desc",
          author: "@new",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
        });
      });
    });

    describe("agents — union by name (no duplicates)", () => {
      it("should union agents from existing and new configs", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["web-developer", "cli-developer"]),
          skills: [],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["web-developer", "api-developer"]),
          skills: [],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          agents: buildAgentConfigs(["web-developer", "api-developer", "cli-developer"]),
          skills: [],
        });
      });

      it("should keep new agents when existing has empty agents array", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          agents: [],
          skills: [],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
        });
      });

      it("should apply a changed model and effort to the existing entry for the same name and scope", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["web-developer"], { model: "haiku", effort: "xhigh" }),
          skills: [],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["web-developer"], { model: "opus", effort: "medium" }),
          skills: [],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(
          result.agents,
          "a model/effort change is the whole edit — it must land, and must not duplicate the row",
        ).toStrictEqual(buildAgentConfigs(["web-developer"], { model: "haiku", effort: "xhigh" }));
      });
    });

    describe("skills — merge by ID (new overrides existing, keeps rest)", () => {
      it("should override existing skills with matching new skills", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react"], { origin: "new-source" }),
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react"], { origin: "old-source" }),
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          agents: buildAgentConfigs(["web-developer"]),
          skills: buildSkillConfigs(["web-framework-react"], { origin: "new-source" }),
        });
      });

      it("should preserve existing skills not in new config", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react"]),
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-state-zustand"]),
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [
            ...buildSkillConfigs(["web-state-zustand"]),
            ...buildSkillConfigs(["web-framework-react"]),
          ],
        });
      });

      it("should add new skills that are not in existing config", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react"]),
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          agents: buildAgentConfigs(["web-developer"]),
          skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
        });
      });

      it("should keep new skills when existing has empty skills array", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react"]),
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          agents: buildAgentConfigs(["web-developer"]),
          skills: buildSkillConfigs(["web-framework-react"]),
        });
      });
    });

    describe("stack — new wins (mutator output is authoritative)", () => {
      it("should replace existing stack entirely when new stack is defined", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
          stack: {
            "web-developer": {
              "web-framework": sa("web-framework-react-new"),
              "web-client-state": sa("web-state-zustand-new"),
            },
          },
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
          stack: {
            "web-developer": {
              "web-framework": sa("web-framework-react-existing"),
              "web-styling": sa("web-styling-scss-existing"),
            },
          },
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
          stack: {
            "web-developer": {
              "web-framework": sa("web-framework-react-new"),
              "web-client-state": sa("web-state-zustand-new"),
            },
          },
        });
      });

      it("should replace existing stack agents with new stack agents", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
          stack: {
            "web-developer": { "web-framework": sa("web-framework-vue") },
            "api-developer": { "api-api": sa("api-framework-hono") },
          },
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
          stack: {
            "web-developer": { "web-framework": sa("web-framework-react") },
          },
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result.stack).toStrictEqual({
          "web-developer": { "web-framework": sa("web-framework-vue") },
          "api-developer": { "api-api": sa("api-framework-hono") },
        });
      });

      it("should use new config stack when existing has no stack", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
          stack: {
            "web-developer": { "web-framework": sa("web-framework-react") },
          },
        });
        const existingConfig = buildProjectConfig({ name: "project", skills: [] });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result.stack).toStrictEqual({
          "web-developer": { "web-framework": sa("web-framework-react") },
        });
      });

      it("should preserve existing stack when new config has no stack at all", () => {
        const newConfig = buildProjectConfig({ name: "project", skills: [] });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
          stack: {
            "web-developer": { "web-framework": sa("web-framework-react") },
          },
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result.stack).toStrictEqual({
          "web-developer": { "web-framework": sa("web-framework-react") },
        });
      });

      it("should use new config empty stack {} (not preserve existing)", () => {
        // An empty stack on newConfig is a deliberate mutator output (no agents survived),
        // distinct from `undefined` (stack-untouching op). Merge must trust `{}`.
        const newConfig = buildProjectConfig({ name: "project", skills: [], stack: {} });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
          stack: {
            "web-developer": { "web-framework": sa("web-framework-react") },
          },
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result.stack).toStrictEqual({});
      });
    });

    it("preserves the existing projects registration when new config omits it (propagation)", () => {
      const newConfig = buildProjectConfig({ name: "global", skills: [], agents: [] });
      const existingConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: ["/home/user/project-a", "/home/user/project-b"],
      });

      const result = mergeConfigs(newConfig, existingConfig);

      expect(result.projects).toStrictEqual(["/home/user/project-a", "/home/user/project-b"]);
    });

    it("should not mutate the input configs", () => {
      const newConfig = buildProjectConfig({
        name: "new-project",
        agents: buildAgentConfigs(["api-developer"]),
        skills: [],
      });
      const existingConfig = buildProjectConfig({
        name: "existing-project",
        agents: buildAgentConfigs(["web-developer"]),
        skills: [],
        author: "@existing",
      });

      mergeConfigs(newConfig, existingConfig);

      // Original inputs should be unchanged
      expect(newConfig.name).toBe("new-project");
      expectAgentConfigs(newConfig, buildAgentConfigs(["api-developer"]));
      expect(newConfig.author).toBeUndefined();
    });

    describe("excluded dual entries", () => {
      it("should preserve both excluded and active entries for the same skill ID", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: [
            ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
            ...buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              origin: "agents-inc",
              excluded: true,
            }),
          ],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        // Both entries should be preserved (compound key: id vs id:excluded)
        const reactEntries = result.skills.filter((s) => s.id === "web-framework-react");
        expect(reactEntries).toHaveLength(2);
        expect(reactEntries.find((s) => !s.excluded)).toStrictEqual({
          id: "web-framework-react",
          scope: "project",
          origin: "eject",
        });
        expect(reactEntries.find((s) => s.excluded)).toStrictEqual({
          id: "web-framework-react",
          scope: "global",
          origin: "agents-inc",
          excluded: true,
        });
      });

      it("should drop existing tombstone when new config is authoritative for the id (active only)", () => {
        // newConfig carries only the active project entry — it does NOT carry
        // the existing tombstone forward. The merge treats newConfig as
        // authoritative for every id it references: the stale tombstone is
        // dropped on the next merge because the wizard did not emit it.
        // Skills at unrelated ids remain untouched.
        const newConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [
            ...buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              origin: "agents-inc",
              excluded: true,
            }),
            ...buildSkillConfigs(["web-testing-vitest"], { scope: "global", origin: "agents-inc" }),
          ],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        // Only the new active entry for react survives; the existing tombstone
        // is dropped because newConfig did not re-emit it.
        const reactEntries = result.skills.filter((s) => s.id === "web-framework-react");
        expect(reactEntries).toStrictEqual([
          {
            id: "web-framework-react",
            scope: "project",
            origin: "eject",
          },
        ]);
        // Existing vitest entry preserved — id is not referenced by newConfig.
        expect(result.skills.find((s) => s.id === "web-testing-vitest")).toStrictEqual({
          id: "web-testing-vitest",
          scope: "global",
          origin: "agents-inc",
        });
      });

      it("should preserve dual-scope tombstone when new config explicitly carries it", () => {
        // Production wizard flows (generateProjectConfigFromSkills) emit BOTH
        // the active entry and the tombstone when a dual-scope install is
        // legitimate. In that case the merger preserves both because new is
        // authoritative for the id and new explicitly lists both shapes.
        const newConfig = buildProjectConfig({
          name: "project",
          skills: [
            ...buildSkillConfigs(["web-framework-react"], {
              scope: "project",
              origin: "eject",
            }),
            ...buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              origin: "agents-inc",
              excluded: true,
            }),
          ],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [
            ...buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              origin: "agents-inc",
              excluded: true,
            }),
            ...buildSkillConfigs(["web-testing-vitest"], { scope: "global", origin: "agents-inc" }),
          ],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        const reactEntries = result.skills.filter((s) => s.id === "web-framework-react");
        expect(reactEntries).toHaveLength(2);
        expect(reactEntries.find((s) => !s.excluded)).toStrictEqual({
          id: "web-framework-react",
          scope: "project",
          origin: "eject",
        });
        expect(reactEntries.find((s) => s.excluded)).toStrictEqual({
          id: "web-framework-react",
          scope: "global",
          origin: "agents-inc",
          excluded: true,
        });
        expect(result.skills.find((s) => s.id === "web-testing-vitest")).toStrictEqual({
          id: "web-testing-vitest",
          scope: "global",
          origin: "agents-inc",
        });
      });

      it("drops BOTH the lingering active project entry and the stale tombstone when a dual-scope skill is fully deselected", () => {
        // Skill-side twin of the agent full-deselect test above.
        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [
            ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
            ...buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              origin: "agents-inc",
              excluded: true,
            }),
            ...buildSkillConfigs(["web-testing-vitest"], { scope: "global", origin: "agents-inc" }),
          ],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result.skills.filter((s) => s.id === "web-framework-react")).toStrictEqual([]);
        // A genuinely-untouched inherited-global skill (no tombstone) is preserved.
        expect(result.skills.find((s) => s.id === "web-testing-vitest")).toStrictEqual({
          id: "web-testing-vitest",
          scope: "global",
          origin: "agents-inc",
        });
      });

      it("drops an active global skill absent from new when newConfig is authoritative (global-context edit)", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "eject" }),
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [
            ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "eject" }),
            ...buildSkillConfigs(["web-testing-vitest"], { scope: "global", origin: "eject" }),
          ],
        });

        const authoritative = mergeConfigs(newConfig, existingConfig, {
          authoritativeScope: "all",
        });
        expect(authoritative.skills.some((s) => s.id === "web-testing-vitest")).toBe(false);
        expect(authoritative.skills.some((s) => s.id === "web-framework-react")).toBe(true);

        const projectEdit = mergeConfigs(newConfig, existingConfig);
        expect(projectEdit.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);
      });

      it("owned-scope edit drops a deselected PROJECT skill but preserves inherited global-active skills (project-context)", () => {
        // Project edit: newConfig keeps react (project) but omits a previously-selected project
        // skill (zustand). The deselected project skill must drop; an inherited global-active
        // skill the project does not own must be preserved even though it is absent from new.
        const newConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [
            ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
            ...buildSkillConfigs(["web-state-zustand"], { scope: "project", origin: "eject" }),
            ...buildSkillConfigs(["web-testing-vitest"], { scope: "global", origin: "agents-inc" }),
          ],
        });

        const result = mergeConfigs(newConfig, existingConfig, { authoritativeScope: "owned" });

        // Deselected project-owned skill dropped.
        expect(result.skills.some((s) => s.id === "web-state-zustand")).toBe(false);
        // Inherited global-active skill preserved (not owned by the project edit).
        expect(result.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);
        expect(result.skills.some((s) => s.id === "web-framework-react")).toBe(true);
      });

      it("drops an existing skill whose id could not be resolved this session, at both scopes", () => {
        // A real installed skill absent from the currently-loaded source matrix is skipped by the
        // wizard (populateFromSkillIds) and never reaches newConfig. It is removed like any other
        // absent owned entry — `edit` names it and says why rather than the config keeping an
        // entry the same run's summary announced as gone.
        const newConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [
            ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
            ...buildSkillConfigs(["web-styling-tailwind"], { scope: "project", origin: "eject" }),
          ],
        });

        const globalEdit = mergeConfigs(newConfig, existingConfig, { authoritativeScope: "all" });
        expect(globalEdit.skills.map((s) => s.id)).toStrictEqual(["web-framework-react"]);

        const projectEdit = mergeConfigs(newConfig, existingConfig, {
          authoritativeScope: "owned",
        });
        expect(projectEdit.skills.map((s) => s.id)).toStrictEqual(["web-framework-react"]);
      });

      it("drops an unresolvable id alongside a genuinely deselected one, keeping the selection", () => {
        // Both absences now mean the same thing to the merge — the entry is gone from the roster
        // the session was authoritative over — so both drop, and only what is still selected stays.
        const newConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [
            ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
            ...buildSkillConfigs(["web-state-zustand"], { scope: "project", origin: "eject" }),
            ...buildSkillConfigs(["web-styling-tailwind"], { scope: "project", origin: "eject" }),
          ],
        });

        const result = mergeConfigs(newConfig, existingConfig, { authoritativeScope: "all" });

        expect(result.skills.map((s) => s.id)).toStrictEqual(["web-framework-react"]);
      });

      it("keeps an unresolvable id an INHERITED global install owns during a project edit", () => {
        // The one thing the drop must not reach: a global-active entry the project merely
        // inherits. It is out of a project edit's authority whether or not this session could
        // resolve it, so the removal never becomes a way to uninstall someone else's install.
        const newConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [
            ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
            ...buildSkillConfigs(["web-styling-tailwind"], { scope: "global", origin: "eject" }),
          ],
        });

        const result = mergeConfigs(newConfig, existingConfig, { authoritativeScope: "owned" });

        expect(result.skills.find((s) => s.id === "web-styling-tailwind")).toStrictEqual({
          id: "web-styling-tailwind",
          scope: "global",
          origin: "eject",
        });
      });

      it("should handle both configs having excluded entries for the same skill ID", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          }),
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          }),
        });

        const result = mergeConfigs(newConfig, existingConfig);

        // Only one excluded entry — compound key deduplicates
        const reactEntries = result.skills.filter((s) => s.id === "web-framework-react");
        expect(reactEntries).toHaveLength(1);
        expect(firstElement(reactEntries).excluded).toBe(true);
      });
    });

    describe("excluded dual entries for agents", () => {
      it("should preserve both excluded and active entries for the same agent name", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          agents: [
            firstElement(buildAgentConfigs(["api-developer"])),
            firstElement(buildAgentConfigs(["api-developer"], { scope: "global", excluded: true })),
          ],
          skills: [],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          agents: [],
          skills: [],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        // Both entries should be preserved (compound key: name vs name:excluded)
        const apiDevEntries = result.agents.filter((a) => a.name === "api-developer");
        expect(apiDevEntries).toHaveLength(2);
        expect(apiDevEntries.find((a) => !a.excluded)).toStrictEqual({
          name: "api-developer",
          scope: "project",
        });
        expect(apiDevEntries.find((a) => a.excluded)).toStrictEqual({
          name: "api-developer",
          scope: "global",
          excluded: true,
        });
      });

      it("should drop existing tombstone when new config is authoritative for the name (active only)", () => {
        // newConfig carries only the active project entry — it does NOT carry
        // the existing global:excluded tombstone forward. The merge treats
        // newConfig as authoritative for every name it references: the stale
        // tombstone is dropped on the next merge because the wizard did not
        // emit it (this is exactly how P→G scope migration cleans up).
        // Agents at unrelated names remain untouched.
        const newConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["api-developer"]),
          skills: [],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          agents: [
            ...buildAgentConfigs(["api-developer"], { scope: "global", excluded: true }),
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ],
          skills: [],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        // Only the new active entry for api-developer survives; the existing
        // tombstone is dropped because newConfig did not re-emit it.
        const apiDevEntries = result.agents.filter((a) => a.name === "api-developer");
        expect(apiDevEntries).toStrictEqual([
          {
            name: "api-developer",
            scope: "project",
          },
        ]);
        // Existing web-developer entry preserved — name is not referenced by newConfig.
        expect(result.agents.find((a) => a.name === "web-developer")).toStrictEqual({
          name: "web-developer",
          scope: "global",
        });
      });

      it("should preserve dual-scope tombstone when new config explicitly carries it", () => {
        // Production wizard flows (toggleAgentScope G→P) emit BOTH the active
        // project entry and the global:excluded tombstone. In that case the
        // merger preserves both because new is authoritative for the name
        // and explicitly lists both shapes — exactly the G→P E2E contract.
        const newConfig = buildProjectConfig({
          name: "project",
          agents: [
            ...buildAgentConfigs(["api-developer"]),
            ...buildAgentConfigs(["api-developer"], { scope: "global", excluded: true }),
          ],
          skills: [],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          agents: [
            ...buildAgentConfigs(["api-developer"], { scope: "global", excluded: true }),
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ],
          skills: [],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        const apiDevEntries = result.agents.filter((a) => a.name === "api-developer");
        expect(apiDevEntries).toHaveLength(2);
        expect(apiDevEntries.find((a) => !a.excluded)).toStrictEqual({
          name: "api-developer",
          scope: "project",
        });
        expect(apiDevEntries.find((a) => a.excluded)).toStrictEqual({
          name: "api-developer",
          scope: "global",
          excluded: true,
        });
        expect(result.agents.find((a) => a.name === "web-developer")).toStrictEqual({
          name: "web-developer",
          scope: "global",
        });
      });

      it("drops BOTH the lingering active project entry and the stale tombstone when a dual-scope agent is fully deselected", () => {
        // Scenario B full-deselect: the wizard emits ZERO entries for the name
        // (a fully-deselected dual-scope agent is neither an active selection nor
        // a tombstone), while the on-disk config still has both the active project
        // entry and the global tombstone. Both must be dropped, not preserved.
        const newConfig = buildProjectConfig({
          name: "project",
          agents: [],
          skills: [],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          agents: [
            ...buildAgentConfigs(["api-developer"], { scope: "project" }),
            ...buildAgentConfigs(["api-developer"], { scope: "global", excluded: true }),
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ],
          skills: [],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result.agents.filter((a) => a.name === "api-developer")).toStrictEqual([]);
        // A genuinely-untouched inherited-global agent (no tombstone) is preserved.
        expect(result.agents.find((a) => a.name === "web-developer")).toStrictEqual({
          name: "web-developer",
          scope: "global",
        });
      });

      it("drops an active global agent absent from new when newConfig is authoritative (global-context edit)", () => {
        // A global-context edit at ~/ loads the entire global config; removing an active
        // global agent yields a newConfig with no entry for it. Union-preserve would wrongly
        // keep it (there is no tombstone to key on) — authoritative merge must drop it.
        const newConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          skills: [],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          agents: [
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
            ...buildAgentConfigs(["api-developer"], { scope: "global" }),
          ],
          skills: [],
        });

        const authoritative = mergeConfigs(newConfig, existingConfig, {
          authoritativeScope: "all",
        });
        expect(authoritative.agents.some((a) => a.name === "api-developer")).toBe(false);
        expect(authoritative.agents.some((a) => a.name === "web-developer")).toBe(true);

        // Without a scope (init / additive merge) the absent agent is union-preserved.
        const initMerge = mergeConfigs(newConfig, existingConfig);
        expect(initMerge.agents.some((a) => a.name === "api-developer")).toBe(true);
      });

      it("owned-scope edit drops a deselected PROJECT agent but preserves inherited global-active agents (project-context)", () => {
        // The exact reported bug: a project-only agent, never dual-scope, fully deselected in a
        // project-context edit. It must drop. An inherited global-active agent the project does
        // not own must survive even though it is absent from newConfig.
        const newConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["cli-developer"], { scope: "project" }),
          skills: [],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          agents: [
            ...buildAgentConfigs(["cli-developer"], { scope: "project" }),
            ...buildAgentConfigs(["cli-tester"], { scope: "project" }),
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ],
          skills: [],
        });

        const result = mergeConfigs(newConfig, existingConfig, { authoritativeScope: "owned" });

        // Deselected project-only agent dropped (no tombstone to key on).
        expect(result.agents.some((a) => a.name === "cli-tester")).toBe(false);
        // Inherited global-active agent preserved (not owned by the project edit).
        expect(result.agents.find((a) => a.name === "web-developer")).toStrictEqual({
          name: "web-developer",
          scope: "global",
        });
        expect(result.agents.some((a) => a.name === "cli-developer")).toBe(true);
      });

      it("should handle both configs having excluded entries for the same agent name", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["api-developer"], { scope: "global", excluded: true }),
          skills: [],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["api-developer"], { scope: "global", excluded: true }),
          skills: [],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        // Only one excluded entry — compound key deduplicates
        const apiDevEntries = result.agents.filter((a) => a.name === "api-developer");
        expect(apiDevEntries).toHaveLength(1);
        expect(firstElement(apiDevEntries).excluded).toBe(true);
      });

      it("should update scope of existing agent when new config has different scope", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
          skills: [],
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          agents: buildAgentConfigs(["api-developer"]),
          skills: [],
        });

        const result = mergeConfigs(newConfig, existingConfig);

        const apiDevEntries = result.agents.filter((a) => a.name === "api-developer");
        expect(apiDevEntries).toHaveLength(1);
        expect(apiDevEntries[0]).toStrictEqual({
          name: "api-developer",
          scope: "global",
        });
      });
    });
  });
});
