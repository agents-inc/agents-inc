import { readFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeProjectPartial } from "../index.js";
import { loadProjectSourceConfig } from "../../configuration/config.js";
import { loadProjectConfigFromDir } from "../../configuration/project-config.js";
import { createTempDir, cleanupTempDir } from "../../__tests__/test-fs-utils.js";
import {
  readTestTsConfig,
  writeRawTestConfig,
  writeTestTsConfig,
} from "../../__tests__/helpers/config-io.js";
import { sa } from "../../__tests__/factories/skill-factories.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";
import type { ProjectConfig } from "../../../types/index.js";

describe("writeProjectPartial", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-write-project-partial-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /**
   * Records the ref the way callers do: read what is on disk, overlay it, hand the partial over.
   */
  async function saveSource(dir: string, source: string, fallbackName: string): Promise<void> {
    const existing = (await loadProjectSourceConfig(dir)) ?? {};
    await writeProjectPartial(dir, { ...existing, marketplace: source }, { fallbackName });
  }

  it("creates config file with source when no config exists", async () => {
    await saveSource(tempDir, "github:my-org/skills", "my-project");

    const configPath = getProjectConfigPath(tempDir, "claude");
    const config = await readTestTsConfig<Record<string, unknown>>(configPath);

    expect(config).toStrictEqual({
      name: "my-project",
      skills: [],
      agents: [],
      marketplace: "github:my-org/skills",
    });
  });

  it("creates the source folder if it does not exist", async () => {
    await saveSource(tempDir, "github:test/repo", "test-project");

    const configPath = getProjectConfigPath(tempDir, "claude");
    const content = await readFile(configPath, "utf-8");

    expect(content).toContain("export default");
    expect(content).toContain("import type { ProjectConfig } from './config-types'");
    expect(content).toContain("satisfies ProjectConfig");
  });

  it("preserves existing config fields when adding source", async () => {
    // Deliberately partial: filling a missing required field is under test.
    await writeTestTsConfig(tempDir, {
      name: "my-project",
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      author: "@vince",
    });

    await saveSource(tempDir, "github:new/source", "fallback-name");

    const configPath = getProjectConfigPath(tempDir, "claude");
    const config = await readTestTsConfig<Record<string, unknown>>(configPath);

    expect(config).toStrictEqual({
      name: "my-project",
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      author: "@vince",
      skills: [],
      marketplace: "github:new/source",
    });
  });

  it("overwrites existing source value", async () => {
    // Deliberately partial, as above.
    await writeTestTsConfig(tempDir, {
      marketplace: "github:old/source",
      name: "project",
    });

    await saveSource(tempDir, "github:new/source", "fallback-name");

    const configPath = getProjectConfigPath(tempDir, "claude");
    const config = await readTestTsConfig<Record<string, unknown>>(configPath);

    expect(config).toStrictEqual({
      name: "project",
      skills: [],
      agents: [],
      marketplace: "github:new/source",
    });
  });

  /**
   * A config that exists but cannot be read is refused, not replaced; the control is the
   * field-preserving spec above.
   */
  it("refuses to overwrite a config file it cannot read, rather than inventing a fresh one", async () => {
    const corruptSource = "invalid typescript content {{";
    const configPath = await writeRawTestConfig(tempDir, corruptSource);

    await expect(saveSource(tempDir, "github:my-org/skills", "recovered-project")).rejects.toThrow(
      configPath,
    );

    expect(
      await readFile(configPath, "utf-8"),
      "the user's file is still theirs — a refusal that had already written is not a refusal",
    ).toBe(corruptSource);
  });

  it("refuses to overwrite a config file that is there and declares nothing", async () => {
    // The raw writer is used only because no config object renders to zero bytes.
    const configPath = await writeRawTestConfig(tempDir, "");

    await expect(saveSource(tempDir, "github:my-org/skills", "empty-project")).rejects.toThrow(
      configPath,
    );

    expect(
      await readFile(configPath, "utf-8"),
      "an empty file is still there, so it is not the absence `?? {}` stands in for",
    ).toBe("");
  });

  it("throws when the partial has no name and no fallback is offered", async () => {
    await expect(writeProjectPartial(tempDir, { marketplace: "github:x/y" })).rejects.toThrow(
      "no project config found",
    );
  });

  /**
   * Lenient load, overlay, re-emit: the writer compacts an exclusive category to a bare value the
   * lenient loader hands back unnormalized, and re-emitting it must not drop the category.
   */
  describe("a lenient-load / re-emit round trip", () => {
    const STACK_WITH_EXCLUSIVE_CATEGORY: NonNullable<ProjectConfig["stack"]> = {
      "web-developer": {
        "web-framework": [sa("web-framework-react")],
        "web-testing": [sa("web-testing-vitest")],
      },
    };

    async function loadFullOrFail(dir: string): Promise<ProjectConfig> {
      const loaded = await loadProjectConfigFromDir(dir, "claude");
      if (!loaded) throw new Error(`config.ts must exist and be loadable at ${dir}`);
      return loaded.config;
    }

    it("preserves an exclusive stack category", async () => {
      await writeProjectPartial(
        tempDir,
        buildProjectConfig({
          name: "stack-project",
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
          stack: STACK_WITH_EXCLUSIVE_CATEGORY,
        }),
      );

      // Pre-condition: the file carries the compact bare form.
      expect(
        await readFile(getProjectConfigPath(tempDir, "claude"), "utf-8"),
        "the writer must emit the exclusive category in its bare form",
      ).toMatch(/'web-framework':\s*'web-framework-react'/);

      await saveSource(tempDir, "github:my-org/skills", "stack-project");

      expect(
        (await loadFullOrFail(tempDir)).stack?.["web-developer"],
        "a re-emit must not drop the exclusive category",
      ).toStrictEqual(STACK_WITH_EXCLUSIVE_CATEGORY["web-developer"]);
    });

    it("preserves an exclusive stack category carrying a preloaded assignment", async () => {
      const preloadedStack: NonNullable<ProjectConfig["stack"]> = {
        "web-developer": { "web-framework": [sa("web-framework-react", true)] },
      };

      await writeProjectPartial(
        tempDir,
        buildProjectConfig({
          name: "preloaded-stack-project",
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
          stack: preloadedStack,
        }),
      );

      await saveSource(tempDir, "github:my-org/skills", "preloaded-stack-project");

      expect(
        (await loadFullOrFail(tempDir)).stack?.["web-developer"],
        "a preloaded exclusive assignment is compacted to a bare OBJECT, and must survive too",
      ).toStrictEqual(preloadedStack["web-developer"]);
    });
  });
});
