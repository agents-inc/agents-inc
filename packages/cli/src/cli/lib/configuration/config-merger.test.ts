import os from "os";
import path from "path";
import { mkdir } from "fs/promises";
import { pick } from "remeda";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeConfigs, mergeWithExistingConfig } from "./config-merger";
import { typedKeys } from "../../utils/typed-object";
import type { ProjectConfig, SkillAssignment, SkillId } from "../../types";
import { DEFAULT_PLUGIN_NAME } from "../../consts";
import { getProjectConfigPath } from "../installation/install-base-dir.js";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders.js";
import {
  buildProjectConfig,
  buildAgentConfigs,
  buildSourceConfig,
} from "../__tests__/factories/config-factories.js";
import { expectAgentConfigs } from "../__tests__/assertions/index.js";
import { firstElement } from "../__tests__/helpers/element-at.js";

/** A `branding` a config declares by hand — no shared configuration sets one. */
const WHITE_LABEL = { name: "Northwind" };

/** The five fields a source repository declares its own layout with, each set off its default. */
const SOURCE_LAYOUT = {
  skillsDir: "catalogue/skills",
  agentsDir: "catalogue/agents",
  stacksFile: "catalogue/stacks.ts",
  categoriesFile: "catalogue/skill-categories.ts",
  rulesFile: "catalogue/skill-rules.ts",
} satisfies Partial<ProjectConfig>;

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

      // Result after a full deselect: zero entries for api-developer.
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

    /** With no project config the merge base is the global one, whose `name` is not adopted. */
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

      it("lends the project none of the global config's branding", async () => {
        await writeTestTsConfig(
          fakeHome,
          buildProjectConfig({ name: GLOBAL_INSTALL_NAME, skills: [], branding: WHITE_LABEL }),
        );

        const result = await mergeWithExistingConfig(
          buildProjectConfig({ name: PROJECT_NAME, skills: [] }),
          { projectDir },
        );

        expect(result.config).not.toHaveProperty("branding");
      });

      it("lends the project none of the global config's source-layout fields", async () => {
        await writeTestTsConfig(
          fakeHome,
          buildProjectConfig({ name: GLOBAL_INSTALL_NAME, skills: [], ...SOURCE_LAYOUT }),
        );

        const result = await mergeWithExistingConfig(
          buildProjectConfig({ name: PROJECT_NAME, skills: [] }),
          { projectDir },
        );

        expect(pick(result.config, typedKeys(SOURCE_LAYOUT))).toStrictEqual({});
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
      expect(result.existingConfigPath).toBe(getProjectConfigPath(tempDir, "claude"));
    });
  });

  describe("mergeConfigs", () => {
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

      /** Under a global install the merge base is the global config, whose name is not ours. */
      it("does not carry an existing marketplace name onto a config made from another marketplace", () => {
        const newConfig = buildProjectConfig({
          name: "project",
          skills: [],
          marketplace: "github:plain/skills",
          marketplaceName: "plain",
        });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
          marketplace: "github:acme/skills",
          marketplaceName: "acme",
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result.marketplace).toBe("github:plain/skills");
        expect(
          result.marketplaceName,
          "the name recorded beside one marketplace does not label another",
        ).toBe("plain");
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

      it("keeps the branding the existing config carried", () => {
        const newConfig = buildProjectConfig({ name: "project", skills: [] });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
          branding: WHITE_LABEL,
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          branding: WHITE_LABEL,
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
        });
      });

      it("keeps the source-layout fields the existing config carried", () => {
        const newConfig = buildProjectConfig({ name: "project", skills: [] });
        const existingConfig = buildProjectConfig({
          name: "project",
          skills: [],
          ...SOURCE_LAYOUT,
        });

        const result = mergeConfigs(newConfig, existingConfig);

        expect(result).toStrictEqual({
          name: "project",
          ...SOURCE_LAYOUT,
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
        // An empty stack is deliberate (no agents survived), unlike `undefined`; trust `{}`.
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
        // newConfig is authoritative for the ids it names, so the tombstone it omits is dropped.
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

        const reactEntries = result.skills.filter((s) => s.id === "web-framework-react");
        expect(reactEntries).toStrictEqual([
          {
            id: "web-framework-react",
            scope: "project",
            origin: "eject",
          },
        ]);
        expect(result.skills.find((s) => s.id === "web-testing-vitest")).toStrictEqual({
          id: "web-testing-vitest",
          scope: "global",
          origin: "agents-inc",
        });
      });

      it("should preserve dual-scope tombstone when new config explicitly carries it", () => {
        // A legitimate dual-scope install lists both shapes, so both are kept.
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
        // The deselected project skill drops; an inherited global one survives though absent.
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

        expect(result.skills.some((s) => s.id === "web-state-zustand")).toBe(false);
        expect(result.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);
        expect(result.skills.some((s) => s.id === "web-framework-react")).toBe(true);
      });

      it("drops an existing skill whose id could not be resolved this session, at both scopes", () => {
        // A skill the loaded matrix lacks never reaches newConfig, so it is removed like any other.
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
        // Both absences mean the same, so both drop.
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
        // A global-active entry the project only inherits is out of a project edit's authority.
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
        // newConfig is authoritative for the names it names, so the tombstone it omits is dropped.
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

        const apiDevEntries = result.agents.filter((a) => a.name === "api-developer");
        expect(apiDevEntries).toStrictEqual([
          {
            name: "api-developer",
            scope: "project",
          },
        ]);
        expect(result.agents.find((a) => a.name === "web-developer")).toStrictEqual({
          name: "web-developer",
          scope: "global",
        });
      });

      it("should preserve dual-scope tombstone when new config explicitly carries it", () => {
        // A legitimate dual-scope agent lists both shapes, so both are kept.
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
        // Full deselect: newConfig has no entry for the name, so both on-disk entries drop.
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
        expect(result.agents.find((a) => a.name === "web-developer")).toStrictEqual({
          name: "web-developer",
          scope: "global",
        });
      });

      it("drops an active global agent absent from new when newConfig is authoritative (global-context edit)", () => {
        // A global-context edit must drop an absent global agent; there is no tombstone to key on.
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
        // A project-only agent fully deselected drops; an inherited global agent survives.
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

        expect(result.agents.some((a) => a.name === "cli-tester")).toBe(false);
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
          agents: buildAgentConfigs(["api-developer"], { scope: "project" }),
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
